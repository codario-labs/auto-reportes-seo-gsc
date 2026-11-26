import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Errors } from '../lib/errors';
import { ACCESS_COOKIE, type AccessService, type AccessSession } from '../modules/access/access.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      accessSession?: AccessSession;
    }
  }
}

/** Exige una sesión válida del panel. */
export function requireAccess(access: AccessService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const session = access.verifySession(req.cookies?.[ACCESS_COOKIE] as string | undefined);
    if (!session) return next(Errors.accessRequired());
    req.accessSession = session;
    next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defensa CSRF para peticiones mutantes: el Origin (o el Referer) debe estar en la lista permitida.
 * Complementa la cookie SameSite=Lax.
 */
export function verifyOrigin(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins.map((o) => o.replace(/\/$/, '')));
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    let origin = req.headers.origin;
    if (!origin && req.headers.referer) {
      try {
        origin = new URL(req.headers.referer).origin;
      } catch {
        origin = undefined;
      }
    }
    if (!origin || !allowed.has(origin.replace(/\/$/, ''))) return next(Errors.originNotAllowed());
    next();
  };
}

function limiter(windowMs: number, limit: number, message: string): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
    },
  });
}

export const rateLimiters = {
  /** Límite general para la API. */
  api: () => limiter(15 * 60_000, 3000, 'Too many requests. Please wait a moment and try again.'),
  /** Fuerza bruta sobre la clave de acceso. */
  unlock: () => limiter(15 * 60_000, 10, 'Too many unlock attempts. Try again in 15 minutes.'),
  /** Inicio del flujo OAuth y callback. */
  oauth: () => limiter(15 * 60_000, 30, 'Too many Google authorization attempts. Try again later.'),
  /** Generación de reportes (consume cuota de GSC y Anthropic). */
  reports: () => limiter(60 * 60_000, 60, 'Report generation limit reached. Try again later.'),
  /** Subidas de archivos. */
  uploads: () => limiter(15 * 60_000, 60, 'Too many uploads. Try again later.'),
};
