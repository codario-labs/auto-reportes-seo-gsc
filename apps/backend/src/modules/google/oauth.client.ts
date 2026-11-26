/**
 * Cliente OAuth 2.0 de Google (flujo de servidor web con PKCE).
 * Docs: https://developers.google.com/identity/protocols/oauth2/web-server
 */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Permiso mínimo para leer Search Console + identidad para mostrar la cuenta conectada. */
export const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const GOOGLE_SCOPES = [GSC_READONLY_SCOPE, 'openid', 'email'] as const;

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
}

export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GoogleOAuthError';
  }

  /** El refresh token ya no es válido (revocado, caducado o la contraseña cambió). */
  get isInvalidGrant(): boolean {
    return this.code === 'invalid_grant';
  }
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

type FetchLike = typeof fetch;

export class GoogleOAuthClient {
  constructor(
    private readonly config: GoogleOAuthConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  get redirectUri(): string {
    return this.config.redirectUri;
  }

  buildAuthorizationUrl(params: { state: string; codeChallenge: string }): string {
    const url = new URL(GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: this.config.redirectUri,
    });
  }

  refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async revokeToken(token: string): Promise<void> {
    const response = await this.fetchImpl(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    // 400 invalid_token = ya revocado; se considera correcto.
    if (!response.ok && response.status !== 400) {
      throw new GoogleOAuthError(`Token revocation failed (${response.status})`, 'revoke_failed', response.status);
    }
  }

  private async tokenRequest(params: Record<string, string>): Promise<GoogleTokenResponse> {
    const response = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...params,
      }).toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json().catch(() => ({}))) as Partial<GoogleTokenResponse> & {
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !body.access_token) {
      const code = body.error ?? 'token_request_failed';
      throw new GoogleOAuthError(body.error_description ?? `Google token request failed (${response.status})`, code, response.status);
    }
    return body as GoogleTokenResponse;
  }
}

/**
 * Decodifica el payload del ID token. Se recibe directamente del endpoint de tokens de Google
 * por TLS, por lo que (según OpenID Connect Core §3.1.3.7) no requiere verificar la firma.
 */
export function decodeIdToken(idToken: string): { sub: string; email?: string } {
  const payload = idToken.split('.')[1];
  if (!payload) throw new GoogleOAuthError('Malformed ID token', 'invalid_id_token', 400);
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: unknown; email?: unknown };
  if (typeof claims.sub !== 'string') throw new GoogleOAuthError('ID token has no subject', 'invalid_id_token', 400);
  return { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined };
}
