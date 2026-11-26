import {
  generateReportInputSchema,
  type GenerateReportInput,
  type GenerateReportResponse,
  type Paginated,
  type ReportDetailDTO,
  type ReportDTO,
  type ReportListQuery,
} from '@codario/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ReadStream } from 'node:fs';
import type { z } from 'zod';
import { Errors } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import type { StorageService } from '../../lib/storage';
import type { AnthropicService } from '../ai/anthropic.service';
import { templateToConfig, type TemplatesService } from '../templates/templates.service';
import type { PerformanceService } from './performance.service';
import type { ReportQueue } from './report.queue';
import { reportInclude, toReportDetailDTO, toReportDTO, type StoredGenerationMeta } from './reports.mapper';

type ParsedGenerateInput = z.output<typeof generateReportInputSchema>;
type ParsedListQuery = Omit<ReportListQuery, 'page' | 'pageSize'> & { page: number; pageSize: number };

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export class ReportsService {
  private queue: ReportQueue | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly performance: PerformanceService,
    private readonly templates: TemplatesService,
    private readonly anthropic: AnthropicService,
    private readonly storage: StorageService,
    private readonly logger: Logger,
  ) {}

  attachQueue(queue: ReportQueue): void {
    this.queue = queue;
  }

  private requireQueue(): ReportQueue {
    if (!this.queue) throw new Error('Report queue not attached');
    return this.queue;
  }

  async create(input: ParsedGenerateInput): Promise<GenerateReportResponse> {
    const market = await this.performance.getMarket(input.marketId);
    if (market.status === 'ARCHIVED') throw Errors.conflict('This market is archived. Activate it to generate reports.', 'MARKET_ARCHIVED');
    if (input.includeAi && !this.anthropic.isConfigured) throw Errors.anthropicNotConfigured();

    // Plantilla: la elegida, la del market o la predeterminada.
    const templateId = input.templateId || market.templateId;
    const template = templateId ? await this.templates.getRow(templateId) : await this.templates.getDefaultRow();
    if (!template) throw Errors.conflict('No report template is available. Create a template first.', 'TEMPLATE_MISSING');

    // Resuelve el periodo con la frescura real de GSC (valida conexión, propiedad y fechas).
    const { period, freshness } = await this.performance.resolvePeriodFor(market, {
      preset: input.periodPreset,
      startDate: input.customStartDate,
      endDate: input.customEndDate,
    });

    // Evita solicitudes duplicadas: devuelve el reporte idéntico que ya está en curso.
    const duplicate = await this.prisma.report.findFirst({
      where: {
        marketId: market.id,
        templateId: template.id,
        includeAi: input.includeAi,
        startDate: toDate(period.current.startDate),
        endDate: toDate(period.current.endDate),
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      include: reportInclude,
    });
    if (duplicate) return { report: toReportDTO(duplicate), deduplicated: true };

    const meta: StoredGenerationMeta = {
      period,
      stageTimings: {},
      gscRequests: 0,
      rowsFetched: 0,
      ai: null,
      pdf: null,
      warnings: [],
    };
    const config = templateToConfig(template);
    const row = await this.prisma.report.create({
      data: {
        marketId: market.id,
        templateId: template.id,
        templateName: template.name,
        templateSnapshot: config as unknown as Prisma.InputJsonValue,
        periodPreset: input.periodPreset,
        requestedStart: input.customStartDate ? toDate(input.customStartDate) : null,
        requestedEnd: input.customEndDate ? toDate(input.customEndDate) : null,
        startDate: toDate(period.current.startDate),
        endDate: toDate(period.current.endDate),
        compareStartDate: toDate(period.previous.startDate),
        compareEndDate: toDate(period.previous.endDate),
        includeAi: input.includeAi,
        aiModel: input.includeAi ? this.anthropic.model : null,
        generationMeta: { ...meta, freshness } as unknown as Prisma.InputJsonValue,
      },
      include: reportInclude,
    });
    this.requireQueue().enqueue(row.id);
    this.logger.info({ reportId: row.id, marketId: market.id, period: period.current }, 'report queued');
    return { report: toReportDTO(row), deduplicated: false };
  }

  async list(query: ParsedListQuery): Promise<Paginated<ReportDTO>> {
    const where: Prisma.ReportWhereInput = {
      ...(query.marketId ? { marketId: query.marketId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            requestedAt: {
              ...(query.from ? { gte: toDate(query.from) } : {}),
              ...(query.to ? { lt: new Date(toDate(query.to).getTime() + 86_400_000) } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        include: reportInclude,
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toReportDTO), total, page: query.page, pageSize: query.pageSize };
  }

  async recent(limit = 6): Promise<ReportDTO[]> {
    const rows = await this.prisma.report.findMany({ include: reportInclude, orderBy: { requestedAt: 'desc' }, take: limit });
    return rows.map(toReportDTO);
  }

  async get(id: string): Promise<ReportDetailDTO> {
    const row = await this.prisma.report.findUnique({
      where: { id },
      include: { ...reportInclude, metrics: true, recommendations: true },
    });
    if (!row) throw Errors.notFound('Report');
    return toReportDetailDTO(row);
  }

  async status(id: string): Promise<ReportDTO> {
    const row = await this.prisma.report.findUnique({ where: { id }, include: reportInclude });
    if (!row) throw Errors.notFound('Report');
    return toReportDTO(row);
  }

  async cancel(id: string): Promise<ReportDTO> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('Report');
    if (row.status !== 'QUEUED' && row.status !== 'RUNNING') {
      throw Errors.conflict('Only queued or running reports can be cancelled.', 'REPORT_NOT_ACTIVE');
    }
    await this.prisma.report.update({ where: { id }, data: { cancelRequested: true } });
    const wasQueued = row.status === 'QUEUED';
    const queue = this.requireQueue();
    queue.cancel(id);
    if (wasQueued) {
      await this.prisma.report.update({
        where: { id },
        data: { status: 'CANCELLED', errorCode: 'CANCELLED', errorMessage: 'Generation was cancelled.', completedAt: new Date() },
      });
    }
    return this.status(id);
  }

  async retry(id: string): Promise<GenerateReportResponse> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('Report');
    if (row.status !== 'FAILED' && row.status !== 'CANCELLED') {
      throw Errors.conflict('Only failed or cancelled reports can be retried.', 'REPORT_NOT_RETRYABLE');
    }
    const input: GenerateReportInput = {
      marketId: row.marketId,
      periodPreset: row.periodPreset,
      templateId: row.templateId,
      includeAi: row.includeAi,
      customStartDate: row.periodPreset === 'CUSTOM' ? (row.requestedStart ?? row.startDate).toISOString().slice(0, 10) : null,
      customEndDate: row.periodPreset === 'CUSTOM' ? (row.requestedEnd ?? row.endDate).toISOString().slice(0, 10) : null,
    };
    return this.create(generateReportInputSchema.parse(input));
  }

  async remove(id: string): Promise<void> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('Report');
    if (row.status === 'QUEUED' || row.status === 'RUNNING') {
      await this.prisma.report.update({ where: { id }, data: { cancelRequested: true } });
      this.requireQueue().cancel(id);
    }
    await this.prisma.report.delete({ where: { id } });
    await this.storage.remove(row.filePath).catch(() => undefined);
  }

  async openDownload(id: string): Promise<{ stream: ReadStream; fileName: string; size: number }> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('Report');
    if (row.status !== 'COMPLETED' || !row.filePath) {
      throw Errors.conflict('The PDF is not available for this report.', 'REPORT_NOT_READY');
    }
    if (!(await this.storage.exists(row.filePath))) {
      throw Errors.conflict('The PDF file is missing from storage. Regenerate the report.', 'REPORT_FILE_MISSING');
    }
    const size = await this.storage.size(row.filePath);
    return { stream: this.storage.stream(row.filePath), fileName: row.fileName ?? `${id}.pdf`, size };
  }

  /** Al arrancar: marca como fallidos los reportes interrumpidos y reencola los pendientes. */
  async recover(): Promise<void> {
    const interrupted = await this.prisma.report.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        errorCode: 'INTERRUPTED',
        errorMessage: 'Generation was interrupted by a server restart. Retry the report.',
        completedAt: new Date(),
      },
    });
    const pending = await this.prisma.report.findMany({
      where: { status: 'QUEUED' },
      orderBy: { requestedAt: 'asc' },
      select: { id: true, cancelRequested: true },
    });
    for (const report of pending) {
      if (report.cancelRequested) {
        await this.prisma.report.update({
          where: { id: report.id },
          data: { status: 'CANCELLED', errorCode: 'CANCELLED', errorMessage: 'Generation was cancelled.', completedAt: new Date() },
        });
      } else {
        this.requireQueue().enqueue(report.id);
      }
    }
    if (interrupted.count || pending.length) {
      this.logger.info({ interrupted: interrupted.count, requeued: pending.length }, 'report queue recovered');
    }
  }
}
