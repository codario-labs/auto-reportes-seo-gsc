import type { GoogleIntegrationStatusDTO } from '@codario/shared';
import type { GoogleConnection, PrismaClient } from '@prisma/client';
import { createPkcePair, randomToken, sha256Hex, type TokenCipher } from '../../lib/crypto';
import { Errors } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import {
  decodeIdToken,
  GoogleOAuthClient,
  GoogleOAuthError,
  GSC_READONLY_SCOPE,
  type GoogleOAuthConfig,
} from './oauth.client';

const STATE_TTL_MS = 10 * 60_000;
/** Margen para renovar el access token antes de que caduque. */
const REFRESH_MARGIN_MS = 90_000;

export class OAuthCallbackError extends Error {
  constructor(readonly reason: string) {
    super(`OAuth callback failed: ${reason}`);
    this.name = 'OAuthCallbackError';
  }
}

export interface GoogleConnectionServiceDeps {
  prisma: PrismaClient;
  cipher: TokenCipher;
  logger: Logger;
  oauthConfig: GoogleOAuthConfig | null;
  missingConfig: string[];
  /** Redirect URI configurada (se muestra aunque falten otras variables). */
  redirectUri?: string | null;
  fetchImpl?: typeof fetch;
}

/**
 * Gestiona la conexión OAuth con Google: inicio del flujo (state + PKCE), callback,
 * almacenamiento cifrado de tokens, renovación automática y desconexión.
 */
export class GoogleConnectionService {
  private readonly oauth: GoogleOAuthClient | null;
  private refreshInFlight: Promise<string> | null = null;

  constructor(private readonly deps: GoogleConnectionServiceDeps) {
    this.oauth = deps.oauthConfig ? new GoogleOAuthClient(deps.oauthConfig, deps.fetchImpl) : null;
  }

  get isConfigured(): boolean {
    return this.oauth !== null;
  }

  get missingConfig(): string[] {
    return this.deps.missingConfig;
  }

  private requireOAuth(): GoogleOAuthClient {
    if (!this.oauth) throw Errors.googleNotConfigured(this.deps.missingConfig);
    return this.oauth;
  }

  async getConnection(): Promise<GoogleConnection | null> {
    return this.deps.prisma.googleConnection.findFirst({ orderBy: { connectedAt: 'desc' } });
  }

  async startAuthorization(sessionId: string): Promise<string> {
    const oauth = this.requireOAuth();
    const { prisma, cipher } = this.deps;
    await prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const state = randomToken(32);
    const pkce = createPkcePair();
    await prisma.oAuthState.create({
      data: {
        stateHash: sha256Hex(state),
        codeVerifierEnc: cipher.encrypt(pkce.verifier),
        sessionId,
        expiresAt: new Date(Date.now() + STATE_TTL_MS),
      },
    });
    return oauth.buildAuthorizationUrl({ state, codeChallenge: pkce.challenge });
  }

  /** Procesa el callback de Google. Lanza OAuthCallbackError con un motivo seguro para mostrar. */
  async handleCallback(params: {
    code?: string;
    state?: string;
    error?: string;
    sessionId: string | null;
  }): Promise<GoogleConnection> {
    const oauth = this.requireOAuth();
    const { prisma, cipher, logger } = this.deps;
    if (params.error) throw new OAuthCallbackError(params.error === 'access_denied' ? 'access_denied' : 'google_error');
    if (!params.code || !params.state) throw new OAuthCallbackError('missing_parameters');

    const stored = await prisma.oAuthState.findUnique({ where: { stateHash: sha256Hex(params.state) } });
    if (!stored) throw new OAuthCallbackError('invalid_state');
    // Uso único: se elimina antes de continuar (si otra petición ya lo consumió, count = 0).
    const consumed = await prisma.oAuthState.deleteMany({ where: { id: stored.id } });
    if (consumed.count !== 1) throw new OAuthCallbackError('invalid_state');
    if (stored.expiresAt.getTime() < Date.now()) throw new OAuthCallbackError('state_expired');
    if (!params.sessionId || params.sessionId !== stored.sessionId) throw new OAuthCallbackError('session_mismatch');

    let tokens;
    try {
      tokens = await oauth.exchangeCode(params.code, cipher.decrypt(stored.codeVerifierEnc));
    } catch (error) {
      logger.warn({ err: error }, 'google code exchange failed');
      throw new OAuthCallbackError('token_exchange_failed');
    }

    const scopes = (tokens.scope ?? '').split(/\s+/).filter(Boolean);
    if (!scopes.includes(GSC_READONLY_SCOPE)) throw new OAuthCallbackError('insufficient_scope');
    if (!tokens.id_token) throw new OAuthCallbackError('missing_identity');
    const identity = decodeIdToken(tokens.id_token);

    const existing = await prisma.googleConnection.findUnique({ where: { googleAccountId: identity.sub } });
    const refreshTokenEnc = tokens.refresh_token
      ? cipher.encrypt(tokens.refresh_token)
      : (existing?.refreshTokenEnc ?? null);
    if (!refreshTokenEnc) throw new OAuthCallbackError('missing_refresh_token');

    const data = {
      email: identity.email ?? null,
      accessTokenEnc: cipher.encrypt(tokens.access_token),
      refreshTokenEnc,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes,
      status: 'CONNECTED' as const,
      lastError: null,
      lastRefreshedAt: new Date(),
      connectedAt: new Date(),
    };

    // App single-user: una única cuenta conectada. Conectar otra reemplaza la anterior.
    const connection = await prisma.$transaction(async (tx) => {
      await tx.googleConnection.deleteMany({ where: { googleAccountId: { not: identity.sub } } });
      return tx.googleConnection.upsert({
        where: { googleAccountId: identity.sub },
        create: { googleAccountId: identity.sub, ...data },
        update: data,
      });
    });
    logger.info({ email: connection.email }, 'google account connected');
    return connection;
  }

  /** Devuelve un access token válido, renovándolo automáticamente si está por caducar. */
  async getAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
    const connection = await this.getConnection();
    if (!connection) throw Errors.googleNotConnected();
    if (connection.status === 'REVOKED') {
      throw Errors.googleNotConnected('Google access was revoked or expired. Reconnect your Google account.');
    }
    const expiresSoon = connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;
    if (!options.forceRefresh && !expiresSoon) {
      return this.deps.cipher.decrypt(connection.accessTokenEnc);
    }
    // Evita renovaciones concurrentes.
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refresh(connection).finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async refresh(connection: GoogleConnection): Promise<string> {
    const oauth = this.requireOAuth();
    const { prisma, cipher, logger } = this.deps;
    if (!connection.refreshTokenEnc) {
      await prisma.googleConnection.update({
        where: { id: connection.id },
        data: { status: 'EXPIRED', lastError: 'No refresh token stored. Reconnect your Google account.' },
      });
      throw Errors.googleNotConnected('Google session expired. Reconnect your Google account.');
    }
    try {
      const tokens = await oauth.refreshAccessToken(cipher.decrypt(connection.refreshTokenEnc));
      await prisma.googleConnection.update({
        where: { id: connection.id },
        data: {
          accessTokenEnc: cipher.encrypt(tokens.access_token),
          ...(tokens.refresh_token ? { refreshTokenEnc: cipher.encrypt(tokens.refresh_token) } : {}),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          status: 'CONNECTED',
          lastError: null,
          lastRefreshedAt: new Date(),
        },
      });
      logger.debug('google access token refreshed');
      return tokens.access_token;
    } catch (error) {
      if (error instanceof GoogleOAuthError && error.isInvalidGrant) {
        await prisma.googleConnection.update({
          where: { id: connection.id },
          data: { status: 'REVOKED', lastError: 'Google rejected the refresh token (revoked or expired).' },
        });
        throw Errors.googleNotConnected('Google access was revoked or expired. Reconnect your Google account.');
      }
      await prisma.googleConnection.update({
        where: { id: connection.id },
        data: { status: 'ERROR', lastError: error instanceof Error ? error.message.slice(0, 480) : 'Token refresh failed' },
      });
      logger.warn({ err: error }, 'google token refresh failed');
      throw Errors.gscApi('Could not refresh the Google access token. Try again in a moment.');
    }
  }

  async disconnect(): Promise<void> {
    const { prisma, cipher, logger } = this.deps;
    const connection = await this.getConnection();
    if (!connection) return;
    if (this.oauth) {
      const token = connection.refreshTokenEnc ?? connection.accessTokenEnc;
      try {
        await this.oauth.revokeToken(cipher.decrypt(token));
      } catch (error) {
        logger.warn({ err: error }, 'google token revocation failed; deleting local connection anyway');
      }
    }
    await prisma.googleConnection.deleteMany({});
    logger.info('google account disconnected');
  }

  async getStatus(): Promise<GoogleIntegrationStatusDTO> {
    const connection = await this.getConnection();
    const propertiesCount = connection
      ? await this.deps.prisma.googleProperty.count({ where: { connectionId: connection.id } })
      : 0;
    return {
      configured: this.isConfigured,
      missingConfig: this.deps.missingConfig,
      connected: Boolean(connection && connection.status !== 'REVOKED'),
      status: connection?.status ?? 'DISCONNECTED',
      email: connection?.email ?? null,
      scopes: connection?.scopes ?? [],
      connectedAt: connection?.connectedAt.toISOString() ?? null,
      lastRefreshedAt: connection?.lastRefreshedAt?.toISOString() ?? null,
      tokenExpiresAt: connection?.tokenExpiresAt.toISOString() ?? null,
      lastError: connection?.lastError ?? null,
      propertiesCount,
      redirectUri: this.deps.oauthConfig?.redirectUri ?? this.deps.redirectUri ?? null,
    };
  }
}
