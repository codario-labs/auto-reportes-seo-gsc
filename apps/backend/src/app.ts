import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import type { Container } from './container';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { rateLimiters, requireAccess, verifyOrigin } from './middleware/security';
import { accessRoutes } from './routes/access.routes';
import {
  marketsRoutes,
  overviewRoutes,
  reportsRoutes,
  settingsRoutes,
  templatesRoutes,
} from './routes/domain.routes';
import { filesRoutes } from './routes/files.routes';
import { integrationsRoutes, oauthCallbackRoute } from './routes/integrations.routes';

export function allowedOrigins(c: Pick<Container, 'env'>): string[] {
  return [...new Set([...c.env.CORS_ORIGINS, new URL(c.env.APP_URL).origin])];
}

export function createApp(c: Container): Express {
  const app = express();
  const origins = allowedOrigins(c);

  app.disable('x-powered-by');
  app.set('trust proxy', c.env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger: c.logger,
      genReqId: (req, res) => {
        const existing = req.headers['x-request-id'];
        const id = typeof existing === 'string' && /^[\w-]{8,64}$/.test(existing) ? existing : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: {
        ignore: (req) => req.url === '/api/health' || /\/api\/reports\/[^/]+\/status/.test(req.url ?? ''),
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // La API solo devuelve JSON, PDFs e imágenes: CSP restrictiva por defecto.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'same-origin' },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use('/api', rateLimiters.api());

  app.get('/api/health', async (_req, res) => {
    let database = true;
    try {
      await c.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = false;
    }
    res.status(database ? 200 : 503).set('Cache-Control', 'no-store').json({ status: database ? 'ok' : 'degraded', database });
  });

  app.use('/api/access', accessRoutes(c));
  // Callback OAuth: lo invoca Google; se valida con state + PKCE + vinculación a la sesión.
  app.use('/api/integrations', oauthCallbackRoute(c));

  const secured = Router();
  secured.use(requireAccess(c.access), verifyOrigin(origins));
  secured.use('/overview', overviewRoutes(c));
  secured.use('/settings', settingsRoutes(c));
  secured.use('/integrations', integrationsRoutes(c));
  secured.use('/templates', templatesRoutes(c));
  secured.use('/markets', marketsRoutes(c));
  secured.use('/reports', reportsRoutes(c));
  secured.use('/files', filesRoutes(c));
  app.use('/api', secured);

  app.use(notFoundHandler);
  app.use(errorHandler(c.logger));
  return app;
}
