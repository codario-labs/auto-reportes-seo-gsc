import { verifyPropertySchema, type IntegrationsStatusDTO } from '@codario/shared';
import { Router, type Request } from 'express';
import type { Container } from '../container';
import { parseInput } from '../lib/validation';
import { rateLimiters } from '../middleware/security';
import { ACCESS_COOKIE } from '../modules/access/access.service';
import { OAuthCallbackError } from '../modules/google/connection.service';

export async function integrationsStatus(c: Container): Promise<IntegrationsStatusDTO> {
  let databaseOk = true;
  try {
    await c.prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseOk = false;
  }
  return {
    google: await c.google.getStatus(),
    anthropic: {
      configured: c.anthropic.isConfigured,
      model: c.env.ANTHROPIC_MODEL,
      effort: c.env.ANTHROPIC_EFFORT,
      fallbackEnabled: c.env.ANTHROPIC_ENABLE_FALLBACK,
    },
    pdf: { engine: 'playwright-chromium', available: c.pdfStatus.available },
    database: { ok: databaseOk },
  };
}

/** Rutas protegidas (requieren sesión del panel). */
export function integrationsRoutes(c: Container): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    res.json(await integrationsStatus(c));
  });

  router.post('/google/connect', rateLimiters.oauth(), async (req, res) => {
    const authorizationUrl = await c.google.startAuthorization(req.accessSession!.sessionId);
    res.json({ authorizationUrl });
  });

  router.post('/google/disconnect', async (_req, res) => {
    await c.google.disconnect();
    c.performance.invalidate();
    res.json(await integrationsStatus(c));
  });

  router.get('/google/properties', async (_req, res) => {
    res.json(await c.properties.list());
  });

  router.post('/google/properties/sync', async (_req, res) => {
    const properties = await c.properties.sync();
    c.performance.invalidate();
    res.json(properties);
  });

  router.post('/google/properties/verify', async (req, res) => {
    const { siteUrl } = parseInput(verifyPropertySchema, req.body);
    res.json(await c.properties.verify(siteUrl));
  });

  return router;
}

function callbackRedirect(c: Container, params: Record<string, string>): string {
  const url = new URL('/integrations', c.env.APP_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Callback OAuth (pública: la invoca Google mediante redirección). La protección CSRF se basa en el
 * parámetro state de un solo uso, vinculado a la sesión del panel que inició el flujo, y en PKCE.
 */
export function oauthCallbackRoute(c: Container): Router {
  const router = Router();
  router.get('/google/callback', rateLimiters.oauth(), async (req: Request, res) => {
    const session = c.access.verifySession(req.cookies?.[ACCESS_COOKIE] as string | undefined);
    const query = req.query as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.length <= 2048 ? v : undefined);
    try {
      await c.google.handleCallback({
        code: str(query.code),
        state: str(query.state),
        error: str(query.error),
        sessionId: session?.sessionId ?? null,
      });
      try {
        await c.properties.sync();
      } catch (error) {
        c.logger.warn({ err: error }, 'property sync after connect failed');
      }
      c.performance.invalidate();
      res.redirect(303, callbackRedirect(c, { google: 'connected' }));
    } catch (error) {
      const reason = error instanceof OAuthCallbackError ? error.reason : 'unexpected_error';
      if (!(error instanceof OAuthCallbackError)) c.logger.error({ err: error }, 'oauth callback failed');
      else c.logger.warn({ reason }, 'oauth callback rejected');
      res.redirect(303, callbackRedirect(c, { google: 'error', reason }));
    }
  });
  return router;
}
