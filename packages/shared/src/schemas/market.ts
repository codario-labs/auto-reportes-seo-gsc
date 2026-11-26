import { z } from 'zod';
import { domainSchema, gscSiteUrlSchema, hexColorSchema } from './common';

export const MARKET_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'] as const;
export type MarketStatus = (typeof MARKET_STATUSES)[number];

export const MARKET_STATUS_LABELS: Record<MarketStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  ARCHIVED: 'Archived',
};

export const marketInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must have at least 2 characters').max(80),
  domain: domainSchema,
  description: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  status: z.enum(MARKET_STATUSES).default('ACTIVE'),
  gscSiteUrl: gscSiteUrlSchema.nullish().transform((v) => (v ? v : null)),
  templateId: z
    .string()
    .trim()
    .max(64)
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type MarketInput = z.input<typeof marketInputSchema>;
export type MarketParsedInput = z.output<typeof marketInputSchema>;

export const marketUpdateSchema = marketInputSchema.partial();
export type MarketUpdateInput = z.input<typeof marketUpdateSchema>;

export const DEFAULT_MARKET_COLORS = { primaryColor: '#1E3A8A', secondaryColor: '#0EA5A4' } as const;
