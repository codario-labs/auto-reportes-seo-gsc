import { z } from 'zod';
import { PERIOD_PRESETS } from '../periods';
import { isoDateSchema, paginationQuerySchema } from './common';

export const REPORT_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STAGES = [
  'QUEUED',
  'FETCHING_DATA',
  'PROCESSING_METRICS',
  'COMPARING_PERIODS',
  'GENERATING_INSIGHTS',
  'RENDERING_PDF',
  'COMPLETED',
] as const;
export type ReportStage = (typeof REPORT_STAGES)[number];

export const REPORT_STAGE_LABELS: Record<ReportStage, string> = {
  QUEUED: 'Queued',
  FETCHING_DATA: 'Fetching Search Console data',
  PROCESSING_METRICS: 'Processing metrics',
  COMPARING_PERIODS: 'Comparing periods',
  GENERATING_INSIGHTS: 'Generating AI insights',
  RENDERING_PDF: 'Rendering PDF',
  COMPLETED: 'Report completed',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Generating',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export const ACTIVE_REPORT_STATUSES: readonly ReportStatus[] = ['QUEUED', 'RUNNING'];

export const generateReportInputSchema = z
  .object({
    marketId: z.string().trim().min(1, 'Select a market').max(64),
    periodPreset: z.enum(PERIOD_PRESETS),
    customStartDate: isoDateSchema.nullish(),
    customEndDate: isoDateSchema.nullish(),
    templateId: z.string().trim().max(64).nullish(),
    includeAi: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.periodPreset !== 'CUSTOM') return;
    if (!value.customStartDate) {
      ctx.addIssue({ code: 'custom', path: ['customStartDate'], message: 'Start date is required' });
    }
    if (!value.customEndDate) {
      ctx.addIssue({ code: 'custom', path: ['customEndDate'], message: 'End date is required' });
    }
    if (value.customStartDate && value.customEndDate && value.customStartDate > value.customEndDate) {
      ctx.addIssue({ code: 'custom', path: ['customEndDate'], message: 'End date must be after start date' });
    }
  });
export type GenerateReportInput = z.input<typeof generateReportInputSchema>;

export const reportListQuerySchema = paginationQuerySchema.extend({
  marketId: z.string().trim().max(64).optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type ReportListQuery = z.input<typeof reportListQuerySchema>;

export const performanceQuerySchema = z.object({
  preset: z.enum(PERIOD_PRESETS).default('LAST_28_DAYS'),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type PerformanceQuery = z.input<typeof performanceQuerySchema>;
