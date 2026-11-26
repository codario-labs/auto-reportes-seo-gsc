import { accessUnlockSchema, type AccessStatusDTO } from '@codario/shared';
import { Router } from 'express';
import type { Container } from '../container';
import { Errors } from '../lib/errors';
import { parseInput } from '../lib/validation';
import { rateLimiters, verifyOrigin } from '../middleware/security';
import { ACCESS_COOKIE } from '../modules/access/access.service';

export function accessRoutes(c: Container): Router {
  const router = Router();
  const origin = verifyOrigin(c.env.CORS_ORIGINS.concat(new URL(c.env.APP_URL).origin));

  router.get('/status', (req, res) => {
    const session = c.access.verifySession(req.cookies?.[ACCESS_COOKIE] as string | undefined);
    const body: AccessStatusDTO = { unlocked: Boolean(session), expiresAt: session?.expiresAt.toISOString() ?? null };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/unlock', rateLimiters.unlock(), origin, (req, res) => {
    const { accessKey } = parseInput(accessUnlockSchema, req.body);
    if (!c.access.verifyAccessKey(accessKey)) {
      c.logger.warn({ ip: req.ip }, 'invalid access key attempt');
      throw Errors.invalidAccessKey();
    }
    const { token, session } = c.access.createSession();
    res.cookie(ACCESS_COOKIE, token, c.access.cookieOptions(session.expiresAt));
    const body: AccessStatusDTO = { unlocked: true, expiresAt: session.expiresAt.toISOString() };
    res.json(body);
  });

  router.post('/lock', origin, (_req, res) => {
    res.clearCookie(ACCESS_COOKIE, c.access.cookieOptions());
    const body: AccessStatusDTO = { unlocked: false, expiresAt: null };
    res.json(body);
  });

  return router;
}
