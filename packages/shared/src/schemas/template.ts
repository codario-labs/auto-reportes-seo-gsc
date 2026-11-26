import { z } from 'zod';
import { METRIC_KEYS } from '../metrics';
import { hexColorSchema } from './common';

export const FONT_KEYS = ['inter', 'manrope', 'ibm-plex-sans', 'dm-sans', 'source-serif-4', 'lora'] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export const FONT_OPTIONS: Record<FontKey, { label: string; family: string; category: 'sans' | 'serif' }> = {
  inter: { label: 'Inter', family: 'Inter', category: 'sans' },
  manrope: { label: 'Manrope', family: 'Manrope', category: 'sans' },
  'ibm-plex-sans': { label: 'IBM Plex Sans', family: 'IBM Plex Sans', category: 'sans' },
  'dm-sans': { label: 'DM Sans', family: 'DM Sans', category: 'sans' },
  'source-serif-4': { label: 'Source Serif 4', family: 'Source Serif 4', category: 'serif' },
  lora: { label: 'Lora', family: 'Lora', category: 'serif' },
};

export const REPORT_SECTION_KEYS = [
  'executiveSummary',
  'performanceOverview',
  'keywordPerformance',
  'pagePerformance',
  'deviceCountry',
  'searchAppearance',
  'aiAnalysis',
  'actionPlan',
  'dataNotes',
] as const;
export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

export const REPORT_SECTION_LABELS: Record<ReportSectionKey, { label: string; description: string }> = {
  executiveSummary: { label: 'Executive summary', description: 'KPIs, period comparison and AI summary' },
  performanceOverview: { label: 'Performance overview', description: 'Trend chart and metric interpretation' },
  keywordPerformance: { label: 'Keyword performance', description: 'Top, rising and declining queries' },
  pagePerformance: { label: 'Page performance', description: 'Top, rising and declining pages' },
  deviceCountry: { label: 'Device & country', description: 'Device split and geographic distribution' },
  searchAppearance: { label: 'Search appearance', description: 'Rich result types (only when GSC has data)' },
  aiAnalysis: { label: 'AI SEO analysis', description: 'Findings, CTR opportunities and strategy' },
  actionPlan: { label: 'Action plan', description: 'Prioritized recommendations and roadmap' },
  dataNotes: { label: 'Data notes', description: 'Methodology, freshness and data limitations' },
};

export const REPORT_CHART_KEYS = [
  'performanceTrend',
  'kpiSparklines',
  'deviceBreakdown',
  'countryBreakdown',
  'queryMovers',
  'pageMovers',
] as const;
export type ReportChartKey = (typeof REPORT_CHART_KEYS)[number];

export const REPORT_CHART_LABELS: Record<ReportChartKey, string> = {
  performanceTrend: 'Performance trend (time series)',
  kpiSparklines: 'KPI sparklines',
  deviceBreakdown: 'Device breakdown chart',
  countryBreakdown: 'Country distribution chart',
  queryMovers: 'Query movers chart',
  pageMovers: 'Page movers chart',
};

export const COVER_STYLES = ['editorial', 'band', 'minimal'] as const;
export type CoverStyle = (typeof COVER_STYLES)[number];

const sectionsShape = Object.fromEntries(REPORT_SECTION_KEYS.map((k) => [k, z.boolean()])) as Record<
  ReportSectionKey,
  z.ZodBoolean
>;
const chartsShape = Object.fromEntries(REPORT_CHART_KEYS.map((k) => [k, z.boolean()])) as Record<
  ReportChartKey,
  z.ZodBoolean
>;

export const templateConfigSchema = z.object({
  colors: z.object({
    primary: hexColorSchema,
    secondary: hexColorSchema,
    background: hexColorSchema,
    text: hexColorSchema,
  }),
  /** Si es true, los colores primario/secundario del market sustituyen a los de la plantilla. */
  useMarketColors: z.boolean(),
  typography: z.object({
    headingFont: z.enum(FONT_KEYS),
    bodyFont: z.enum(FONT_KEYS),
    baseFontSize: z.number().min(8.5).max(12),
  }),
  cover: z.object({
    style: z.enum(COVER_STYLES),
    title: z.string().trim().min(1, 'Title is required').max(80),
    subtitle: z.string().trim().max(160),
  }),
  sections: z.object(sectionsShape),
  charts: z.object(chartsShape),
  trendMetrics: z
    .array(z.enum(METRIC_KEYS))
    .min(1, 'Select at least one metric')
    .max(4)
    .refine((arr) => new Set(arr).size === arr.length, 'Duplicated metrics'),
  header: z.object({
    enabled: z.boolean(),
    text: z.string().trim().max(80),
    showMarketLogo: z.boolean(),
  }),
  footer: z.object({
    enabled: z.boolean(),
    text: z.string().trim().max(120),
    showPageNumbers: z.boolean(),
    showGeneratedDate: z.boolean(),
  }),
  tables: z.object({
    maxRows: z.number().int().min(5).max(25),
  }),
});

export type TemplateConfig = z.infer<typeof templateConfigSchema>;

export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  colors: {
    primary: '#1E3A8A',
    secondary: '#0EA5A4',
    background: '#FFFFFF',
    text: '#111827',
  },
  useMarketColors: true,
  typography: {
    headingFont: 'manrope',
    bodyFont: 'inter',
    baseFontSize: 10,
  },
  cover: {
    style: 'editorial',
    title: 'SEO Performance Report',
    subtitle: 'Análisis de rendimiento orgánico en Google Search',
  },
  sections: {
    executiveSummary: true,
    performanceOverview: true,
    keywordPerformance: true,
    pagePerformance: true,
    deviceCountry: true,
    searchAppearance: true,
    aiAnalysis: true,
    actionPlan: true,
    dataNotes: true,
  },
  charts: {
    performanceTrend: true,
    kpiSparklines: true,
    deviceBreakdown: true,
    countryBreakdown: true,
    queryMovers: true,
    pageMovers: true,
  },
  trendMetrics: ['clicks', 'impressions', 'ctr', 'position'],
  header: {
    enabled: true,
    text: 'SEO Performance Report',
    showMarketLogo: true,
  },
  footer: {
    enabled: true,
    text: 'Confidencial — preparado por Codario Labs',
    showPageNumbers: true,
    showGeneratedDate: true,
  },
  tables: {
    maxRows: 10,
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (!(key in base)) continue; // ignora claves desconocidas
    const baseValue = (base as Record<string, unknown>)[key];
    out[key] = isPlainObject(baseValue) ? deepMerge(baseValue, value) : value === undefined ? baseValue : value;
  }
  return out as T;
}

/**
 * Normaliza una configuración (posiblemente parcial o de una versión anterior)
 * completándola con los valores predeterminados. Si algo es inválido, cae al valor por defecto.
 */
export function normalizeTemplateConfig(input: unknown): TemplateConfig {
  const merged = deepMerge(DEFAULT_TEMPLATE_CONFIG, input);
  const parsed = templateConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_TEMPLATE_CONFIG;
}

export const templateInputSchema = z.object({
  name: z.string().trim().min(2, 'Name must have at least 2 characters').max(80),
  description: z.string().trim().max(300).nullish(),
  config: templateConfigSchema,
  isDefault: z.boolean().optional(),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

export const templateUpdateSchema = templateInputSchema.partial();
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;

export const templatePreviewInputSchema = z.object({
  config: templateConfigSchema,
  marketId: z.string().trim().min(1).max(64).nullish(),
});
export type TemplatePreviewInput = z.infer<typeof templatePreviewInputSchema>;
