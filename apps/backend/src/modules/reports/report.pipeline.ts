import { DEFAULT_TEMPLATE_CONFIG, describeRange, type AiAnalysis, type AiAnalysisMeta, type ReportDataset, type ReportStage } from '@codario/shared';
import type { InsightSection, MetricKey as DbMetricKey, Prisma, PrismaClient, RecommendationPriority } from '@prisma/client';
import path from 'node:path';
import { isAppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { safeFileName, STORAGE_DIRS, type StorageService } from '../../lib/storage';
import type { AnthropicService } from '../ai/anthropic.service';
import { compareAndAssemble, fetchRawData, processMetrics } from '../analytics/dataset.builder';
import type { MarketsService } from '../markets/markets.service';
import type { PdfRenderer } from '../pdf/pdf.renderer';
import { renderReport } from '../pdf/report-template';
import { toDataUri, type SettingsService } from '../settings/settings.service';
import { templateToConfig } from '../templates/templates.service';
import type { PerformanceService } from './performance.service';
import { CancellationError } from './report.queue';
import { readMeta, snapshotConfig, type StoredGenerationMeta } from './reports.mapper';

const METRIC_TO_DB: Record<string, DbMetricKey> = { clicks: 'CLICKS', impressions: 'IMPRESSIONS', ctr: 'CTR', position: 'POSITION' };

export interface PipelineDeps {
  prisma: PrismaClient;
  performance: PerformanceService;
  anthropic: AnthropicService;
  renderer: PdfRenderer;
  storage: StorageService;
  settings: SettingsService;
  markets: MarketsService;
  logger: Logger;
  maxRowsPerDimension: number;
}

/**
 * Pipeline real de generación de un reporte. Cada etapa actualiza el estado en la base de datos
 * para que el frontend muestre el progreso real (sin porcentajes simulados).
 */
export class ReportPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  run = async (reportId: string, signal: AbortSignal): Promise<void> => {
    const { prisma, logger } = this.deps;
    const report = await prisma.report.findUnique({ where: { id: reportId }, include: { market: true, template: true } });
    if (!report || report.status !== 'QUEUED') return;
    if (report.cancelRequested) {
      await this.finishCancelled(reportId);
      return;
    }
    const meta: StoredGenerationMeta = readMeta(report) ?? ({ stageTimings: {}, warnings: [] } as unknown as StoredGenerationMeta);
    meta.stageTimings = {};
    meta.warnings = [];
    const log = logger.child({ reportId, marketId: report.marketId });

    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'RUNNING', stage: 'FETCHING_DATA', startedAt: new Date(), errorCode: null, errorMessage: null },
    });

    const stage = async <T>(name: ReportStage, fn: () => Promise<T>): Promise<T> => {
      signal.throwIfAborted();
      await prisma.report.update({
        where: { id: reportId },
        data: { stage: name, generationMeta: meta as unknown as Prisma.InputJsonValue },
      });
      const started = Date.now();
      const result = await fn();
      meta.stageTimings[name] = Date.now() - started;
      return result;
    };

    try {
      const { market } = report;
      const period = meta.period;
      const siteUrl = await this.deps.performance.resolveSiteUrl(market);
      const client = this.deps.performance.createClient(signal);

      // 1. Datos de Search Console
      const { raw, freshness } = await stage('FETCHING_DATA', async () => {
        const { freshness: fresh } = await this.deps.performance.getFreshnessFor(market, { signal });
        const rawData = await fetchRawData({ client, siteUrl, period, freshness: fresh, maxRowsPerDimension: this.deps.maxRowsPerDimension, signal });
        return { raw: rawData, freshness: fresh };
      });

      // 2. Métricas
      const metrics = await stage('PROCESSING_METRICS', async () => processMetrics(raw, period));

      // 3. Comparación de periodos y oportunidades
      const dataset: ReportDataset = await stage('COMPARING_PERIODS', async () => {
        const assembled = compareAndAssemble(raw, metrics, { siteUrl, period, freshness, maxRowsPerDimension: this.deps.maxRowsPerDimension }, {
          gscRequests: client.requestCount,
        });
        await prisma.$transaction([
          prisma.reportMetric.deleteMany({ where: { reportId } }),
          prisma.reportMetric.createMany({
            data: assembled.totals.deltas.map((d) => ({
              reportId,
              metric: METRIC_TO_DB[d.metric]!,
              currentValue: d.current,
              previousValue: d.previous,
              absoluteChange: d.absoluteChange,
              percentChange: d.percentChange,
            })),
          }),
          prisma.report.update({ where: { id: reportId }, data: { metricsData: assembled as unknown as Prisma.InputJsonValue } }),
        ]);
        meta.gscRequests = client.requestCount;
        meta.rowsFetched = assembled.stats.rowsFetched;
        meta.warnings.push(...assembled.dataQuality.warnings);
        return assembled;
      });

      // 4. Análisis con IA
      let analysis: AiAnalysis | null = null;
      let aiMeta: AiAnalysisMeta | null = null;
      if (report.includeAi) {
        const result = await stage('GENERATING_INSIGHTS', () =>
          this.deps.anthropic.analyze(dataset, { marketName: market.name, domain: market.domain, description: market.description }, { signal }),
        );
        analysis = result.analysis;
        aiMeta = result.meta;
        meta.ai = aiMeta;
        await this.saveAnalysis(reportId, analysis, aiMeta);
      }

      // 5. PDF
      const pdf = await stage('RENDERING_PDF', async () => {
        const settings = await this.deps.settings.get();
        // Se usa la configuración capturada al solicitar el reporte (reproducible aunque la plantilla cambie).
        const config = snapshotConfig(report, report.template ? templateToConfig(report.template) : DEFAULT_TEMPLATE_CONFIG);
        const [globalLogo, marketLogo] = await Promise.all([this.deps.settings.getGlobalLogo(), this.deps.markets.getLogo(market)]);
        const rendered = renderReport({
          mode: 'pdf',
          dataset,
          analysis,
          aiMeta,
          includeAi: report.includeAi,
          market: {
            name: market.name,
            domain: market.domain,
            description: market.description,
            logoDataUri: toDataUri(marketLogo),
            primaryColor: market.primaryColor,
            secondaryColor: market.secondaryColor,
          },
          template: config,
          branding: { companyName: settings.companyName, logoDataUri: toDataUri(globalLogo) },
          generatedAt: new Date(),
          timezone: settings.timezone,
        });
        const output = await this.deps.renderer.render(
          rendered,
          {
            title: rendered.title,
            author: settings.companyName,
            subject: `SEO Performance Report — ${market.domain} — ${describeRange(period.current)}`,
          },
          signal,
        );
        const fileName = `${safeFileName(`seo-report-${market.name}`)}-${period.current.startDate}_${period.current.endDate}.pdf`;
        const relative = path.posix.join(STORAGE_DIRS.reports, market.id, `${reportId}.pdf`);
        await this.deps.storage.write(relative, output.buffer);
        meta.pdf = { pages: output.pages, bytes: output.buffer.length, durationMs: output.durationMs };
        return { fileName, relative, size: output.buffer.length };
      });

      await prisma.report.update({
        where: { id: reportId },
        data: {
          status: 'COMPLETED',
          stage: 'COMPLETED',
          fileName: pdf.fileName,
          filePath: pdf.relative,
          fileSize: pdf.size,
          completedAt: new Date(),
          generationMeta: meta as unknown as Prisma.InputJsonValue,
        },
      });
      log.info({ durationMs: Object.values(meta.stageTimings).reduce((a, b) => a + (b ?? 0), 0) }, 'report completed');
    } catch (error) {
      const cancelled = signal.aborted && (signal.reason instanceof CancellationError || (await this.isCancelRequested(reportId)));
      if (cancelled) {
        log.info('report cancelled');
        await this.finishCancelled(reportId, meta);
        return;
      }
      const timedOut = signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError';
      const code = timedOut ? 'TIMEOUT' : isAppError(error) ? error.code : 'INTERNAL_ERROR';
      const message = timedOut
        ? 'Report generation exceeded the maximum allowed time.'
        : isAppError(error)
          ? error.message
          : 'Unexpected error while generating the report. Check the server logs.';
      if (!isAppError(error)) log.error({ err: error }, 'report generation failed');
      else log.warn({ code, message }, 'report generation failed');
      await prisma.report
        .update({
          where: { id: reportId },
          data: {
            status: 'FAILED',
            errorCode: code.slice(0, 64),
            errorMessage: message.slice(0, 1000),
            completedAt: new Date(),
            generationMeta: meta as unknown as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);
    }
  };

  private async isCancelRequested(reportId: string): Promise<boolean> {
    const row = await this.deps.prisma.report.findUnique({ where: { id: reportId }, select: { cancelRequested: true } });
    return Boolean(row?.cancelRequested);
  }

  private async finishCancelled(reportId: string, meta?: StoredGenerationMeta): Promise<void> {
    await this.deps.prisma.report
      .update({
        where: { id: reportId },
        data: {
          status: 'CANCELLED',
          errorCode: 'CANCELLED',
          errorMessage: 'Generation was cancelled.',
          completedAt: new Date(),
          ...(meta ? { generationMeta: meta as unknown as Prisma.InputJsonValue } : {}),
        },
      })
      .catch(() => undefined);
  }

  private async saveAnalysis(reportId: string, analysis: AiAnalysis, aiMeta: AiAnalysisMeta): Promise<void> {
    const { prisma } = this.deps;
    const insights: Array<{ section: InsightSection; content: unknown }> = [
      { section: 'EXECUTIVE_SUMMARY', content: analysis.executiveSummary },
      { section: 'PERFORMANCE_ANALYSIS', content: analysis.performanceAnalysis },
      { section: 'KEYWORD_ANALYSIS', content: analysis.keywordAnalysis },
      { section: 'PAGE_ANALYSIS', content: analysis.pageAnalysis },
      { section: 'CTR_OPPORTUNITIES', content: analysis.ctrOpportunities },
      { section: 'OPPORTUNITIES', content: analysis.opportunities },
      { section: 'CONCLUSIONS', content: analysis.conclusions },
      { section: 'DATA_LIMITATIONS', content: analysis.dataLimitations },
    ];
    await prisma.$transaction([
      prisma.reportInsight.deleteMany({ where: { reportId } }),
      prisma.reportRecommendation.deleteMany({ where: { reportId } }),
      prisma.reportInsight.createMany({
        data: insights.map((i, index) => ({ reportId, section: i.section, content: i.content as Prisma.InputJsonValue, sortOrder: index })),
      }),
      prisma.reportRecommendation.createMany({
        data: analysis.recommendations.map((r, index) => ({
          reportId,
          priority: r.priority.toUpperCase() as RecommendationPriority,
          title: r.title.slice(0, 300),
          problem: r.problem,
          evidence: r.evidence,
          potentialImpact: r.potentialImpact,
          action: r.action,
          justification: r.justification,
          relatedQueries: r.relatedQueries,
          relatedPages: r.relatedPages,
          sortOrder: index,
        })),
      }),
      prisma.report.update({
        where: { id: reportId },
        data: { aiAnalysis: analysis as unknown as Prisma.InputJsonValue, aiModel: aiMeta.servedBy },
      }),
    ]);
  }
}
