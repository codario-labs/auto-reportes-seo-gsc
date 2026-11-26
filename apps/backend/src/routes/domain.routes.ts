import {
  generateReportInputSchema,
  idParamsSchema,
  marketInputSchema,
  marketUpdateSchema,
  performanceQuerySchema,
  reportListQuerySchema,
  settingsUpdateSchema,
  startOfMonth,
  templateInputSchema,
  templatePreviewInputSchema,
  templateUpdateSchema,
  todayInTimeZone,
  type AiAnalysis,
  type AiAnalysisMeta,
  type OverviewDTO,
  type ReportDataset,
} from '@codario/shared';
import { Router, type Request, type RequestHandler } from 'express';
import type { Container } from '../container';
import { parseInput } from '../lib/validation';
import { logoUpload } from '../lib/uploads';
import { rateLimiters } from '../middleware/security';
import { renderPreview } from '../modules/pdf/report-template';
import { readMeta } from '../modules/reports/reports.mapper';
import { toDataUri } from '../modules/settings/settings.service';
import { integrationsStatus } from './integrations.routes';

const idOf = (req: Request) => parseInput(idParamsSchema, req.params).id;

/** Multer como promesa para que los errores lleguen al manejador central. */
const upload: RequestHandler = (req, res, next) => logoUpload(req, res, (err?: unknown) => next(err));

export function settingsRoutes(c: Container): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.json(await c.settings.toDTO());
  });
  router.put('/', async (req, res) => {
    res.json(await c.settings.update(parseInput(settingsUpdateSchema, req.body)));
  });
  router.post('/logo', rateLimiters.uploads(), upload, async (req, res) => {
    res.json(await c.settings.setGlobalLogo(req.file));
  });
  router.delete('/logo', async (_req, res) => {
    res.json(await c.settings.removeGlobalLogo());
  });
  return router;
}

export function templatesRoutes(c: Container): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.json(await c.templates.list());
  });
  router.post('/', async (req, res) => {
    res.status(201).json(await c.templates.create(parseInput(templateInputSchema, req.body)));
  });
  // Vista previa: usa el último reporte completado del market (datos reales) o marcadores sin cifras.
  router.post('/preview', async (req, res) => {
    const input = parseInput(templatePreviewInputSchema, req.body);
    const settings = await c.settings.get();
    const globalLogo = await c.settings.getGlobalLogo();
    let market = {
      name: 'Market name',
      domain: 'example.com',
      description: null as string | null,
      logoDataUri: null as string | null,
      primaryColor: input.config.colors.primary,
      secondaryColor: input.config.colors.secondary,
    };
    let dataset: ReportDataset | null = null;
    let analysis: AiAnalysis | null = null;
    let aiMeta: AiAnalysisMeta | null = null;
    if (input.marketId) {
      const row = await c.markets.getRow(input.marketId);
      market = {
        name: row.name,
        domain: row.domain,
        description: row.description,
        logoDataUri: toDataUri(await c.markets.getLogo(row)),
        primaryColor: row.primaryColor,
        secondaryColor: row.secondaryColor,
      };
      const latest = await c.prisma.report.findFirst({
        where: { marketId: row.id, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
      });
      if (latest?.metricsData) {
        dataset = latest.metricsData as unknown as ReportDataset;
        analysis = (latest.aiAnalysis as unknown as AiAnalysis | null) ?? null;
        aiMeta = readMeta(latest)?.ai ?? null;
      }
    }
    const htmlDoc = renderPreview({
      mode: 'preview',
      dataset,
      analysis,
      aiMeta,
      includeAi: analysis !== null,
      market,
      template: input.config,
      branding: { companyName: settings.companyName, logoDataUri: toDataUri(globalLogo) },
      generatedAt: new Date(),
      timezone: settings.timezone,
    });
    res
      .type('html')
      .set('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; sandbox")
      .set('Cache-Control', 'no-store')
      .send(htmlDoc);
  });
  router.get('/:id', async (req, res) => {
    res.json(await c.templates.get(idOf(req)));
  });
  router.put('/:id', async (req, res) => {
    res.json(await c.templates.update(idOf(req), parseInput(templateUpdateSchema, req.body)));
  });
  router.delete('/:id', async (req, res) => {
    await c.templates.remove(idOf(req));
    res.status(204).end();
  });
  router.post('/:id/duplicate', async (req, res) => {
    res.status(201).json(await c.templates.duplicate(idOf(req)));
  });
  router.post('/:id/reset', async (req, res) => {
    res.json(await c.templates.resetToDefaults(idOf(req)));
  });
  return router;
}

export function marketsRoutes(c: Container): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.json(await c.markets.list());
  });
  router.post('/', async (req, res) => {
    res.status(201).json(await c.markets.create(parseInput(marketInputSchema, req.body)));
  });
  router.get('/:id', async (req, res) => {
    res.json(await c.markets.get(idOf(req)));
  });
  router.put('/:id', async (req, res) => {
    const market = await c.markets.update(idOf(req), parseInput(marketUpdateSchema, req.body));
    c.performance.invalidate();
    res.json(market);
  });
  router.delete('/:id', async (req, res) => {
    const id = idOf(req);
    const active = await c.prisma.report.findMany({ where: { marketId: id, status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } });
    for (const r of active) c.queue.cancel(r.id);
    await c.markets.remove(id);
    res.status(204).end();
  });
  router.post('/:id/logo', rateLimiters.uploads(), upload, async (req, res) => {
    res.json(await c.markets.setLogo(idOf(req), req.file));
  });
  router.delete('/:id/logo', async (req, res) => {
    res.json(await c.markets.removeLogo(idOf(req)));
  });
  router.get('/:id/freshness', async (req, res) => {
    res.json(await c.performance.getFreshnessDTO(idOf(req), req.query.refresh === 'true'));
  });
  router.get('/:id/performance', async (req, res) => {
    const query = parseInput(performanceQuerySchema, req.query);
    res.json(
      await c.performance.getPerformance(idOf(req), {
        preset: query.preset,
        startDate: query.startDate,
        endDate: query.endDate,
        refresh: query.refresh,
      }),
    );
  });
  return router;
}

export function reportsRoutes(c: Container): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    res.json(await c.reports.list(parseInput(reportListQuerySchema, req.query)));
  });
  router.post('/', rateLimiters.reports(), async (req, res) => {
    res.status(202).json(await c.reports.create(parseInput(generateReportInputSchema, req.body)));
  });
  router.get('/:id', async (req, res) => {
    res.json(await c.reports.get(idOf(req)));
  });
  router.get('/:id/status', async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await c.reports.status(idOf(req)));
  });
  router.get('/:id/download', async (req, res) => {
    const file = await c.reports.openDownload(idOf(req));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(file.size),
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    file.stream.on('error', (error) => {
      c.logger.error({ err: error }, 'pdf stream failed');
      res.destroy(error);
    });
    file.stream.pipe(res);
  });
  router.post('/:id/cancel', async (req, res) => {
    res.json(await c.reports.cancel(idOf(req)));
  });
  router.post('/:id/retry', rateLimiters.reports(), async (req, res) => {
    res.status(202).json(await c.reports.retry(idOf(req)));
  });
  router.delete('/:id', async (req, res) => {
    await c.reports.remove(idOf(req));
    res.status(204).end();
  });
  return router;
}

export function overviewRoutes(c: Container): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    const settings = await c.settings.get();
    const monthStart = new Date(`${startOfMonth(todayInTimeZone(settings.timezone))}T00:00:00.000Z`);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const [total, active, withProperty, reportsTotal, completedThisMonth, running, failed, recent, integrations] = await Promise.all([
      c.prisma.market.count(),
      c.prisma.market.count({ where: { status: 'ACTIVE' } }),
      c.prisma.market.count({ where: { gscSiteUrl: { not: null } } }),
      c.prisma.report.count(),
      c.prisma.report.count({ where: { status: 'COMPLETED', completedAt: { gte: monthStart } } }),
      c.prisma.report.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
      c.prisma.report.count({ where: { status: 'FAILED', requestedAt: { gte: weekAgo } } }),
      c.reports.recent(6),
      integrationsStatus(c),
    ]);
    const body: OverviewDTO = {
      markets: { total, active, withProperty },
      reports: { total: reportsTotal, completedThisMonth, running, failedLast7Days: failed },
      recentReports: recent,
      integrations,
    };
    res.json(body);
  });
  return router;
}
