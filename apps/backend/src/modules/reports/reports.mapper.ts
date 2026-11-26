import {
  normalizeTemplateConfig,
  type AiAnalysis,
  type GenerationMetaDTO,
  type MetricKey,
  type PriorityLevel,
  type ReportDataset,
  type ReportDetailDTO,
  type ReportDTO,
  type ReportStage,
  type ResolvedPeriod,
  type TemplateConfig,
} from '@codario/shared';
import type { Market, Prisma, Report, ReportMetric, ReportRecommendation, Template } from '@prisma/client';
import { logoUrlFor } from '../markets/markets.service';

export type ReportWithRelations = Report & {
  market: Pick<Market, 'id' | 'name' | 'domain' | 'logoPath' | 'primaryColor' | 'updatedAt'>;
  template: Pick<Template, 'id' | 'name'> | null;
};

export const reportInclude = {
  market: { select: { id: true, name: true, domain: true, logoPath: true, primaryColor: true, updatedAt: true } },
  template: { select: { id: true, name: true } },
} satisfies Prisma.ReportInclude;

/** Metadatos persistidos en Report.generationMeta. */
export interface StoredGenerationMeta extends GenerationMetaDTO {
  period: ResolvedPeriod;
}

export function readMeta(report: Pick<Report, 'generationMeta'>): StoredGenerationMeta | null {
  return (report.generationMeta as unknown as StoredGenerationMeta | null) ?? null;
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function toReportDTO(row: ReportWithRelations): ReportDTO {
  const meta = readMeta(row);
  return {
    id: row.id,
    market: {
      id: row.market.id,
      name: row.market.name,
      domain: row.market.domain,
      logoUrl: logoUrlFor(row.market.logoPath, row.market.updatedAt),
      primaryColor: row.market.primaryColor,
    },
    template: row.template ? { id: row.template.id, name: row.template.name } : row.templateName ? { id: '', name: row.templateName } : null,
    periodPreset: row.periodPreset,
    startDate: isoDate(row.startDate),
    endDate: isoDate(row.endDate),
    compareStartDate: isoDate(row.compareStartDate),
    compareEndDate: isoDate(row.compareEndDate),
    status: row.status,
    stage: row.stage,
    stageTimings: (meta?.stageTimings ?? {}) as Partial<Record<ReportStage, number>>,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    fileName: row.fileName,
    fileSize: row.fileSize,
    includeAi: row.includeAi,
    aiModel: row.aiModel,
    downloadUrl: row.status === 'COMPLETED' && row.filePath ? `/api/reports/${row.id}/download` : null,
    requestedAt: row.requestedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

const METRIC_FROM_DB: Record<string, MetricKey> = { CLICKS: 'clicks', IMPRESSIONS: 'impressions', CTR: 'ctr', POSITION: 'position' };

export function toReportDetailDTO(
  row: ReportWithRelations & { metrics: ReportMetric[]; recommendations: ReportRecommendation[] },
): ReportDetailDTO {
  const meta = readMeta(row);
  return {
    ...toReportDTO(row),
    metrics: row.metrics.map((m) => ({
      metric: METRIC_FROM_DB[m.metric]!,
      currentValue: m.currentValue,
      previousValue: m.previousValue,
      absoluteChange: m.absoluteChange,
      percentChange: m.percentChange,
    })),
    recommendations: [...row.recommendations]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({
        id: r.id,
        priority: r.priority.toLowerCase() as PriorityLevel,
        title: r.title,
        problem: r.problem,
        evidence: r.evidence,
        potentialImpact: r.potentialImpact,
        action: r.action,
        justification: r.justification,
        relatedQueries: r.relatedQueries,
        relatedPages: r.relatedPages,
      })),
    analysis: (row.aiAnalysis as unknown as AiAnalysis | null) ?? null,
    dataset: (row.metricsData as unknown as ReportDataset | null) ?? null,
    generationMeta: meta
      ? {
          stageTimings: meta.stageTimings ?? {},
          gscRequests: meta.gscRequests ?? 0,
          rowsFetched: meta.rowsFetched ?? 0,
          ai: meta.ai ?? null,
          pdf: meta.pdf ?? null,
          warnings: meta.warnings ?? [],
        }
      : null,
  };
}

export function snapshotConfig(report: Pick<Report, 'templateSnapshot'>, fallback: TemplateConfig): TemplateConfig {
  return report.templateSnapshot ? normalizeTemplateConfig(report.templateSnapshot) : fallback;
}
