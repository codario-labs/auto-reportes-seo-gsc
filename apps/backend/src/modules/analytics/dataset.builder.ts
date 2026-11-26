import {
  computeTotalsDeltas,
  detectPropertyType,
  formatDataIssue,
  type BreakdownSection,
  type DataFreshness,
  type DataIssue,
  type DateRange,
  type DimensionAnalysis,
  type ReportDataset,
  type ResolvedPeriod,
} from '@codario/shared';
import { Errors, isAppError } from '../../lib/errors';
import {
  GscApiError,
  type GscDimension,
  type SearchAnalyticsResponse,
  type SearchAnalyticsRow,
  type SearchConsoleClient,
} from '../gsc/gsc.client';
import {
  analyzeDimension,
  buildBreakdown,
  buildTimeseries,
  emptyDimensionAnalysis,
  toKeyedRows,
  toTotals,
} from './processing';

type Fetched<T> = { ok: true; value: T } | { ok: false; error: string };

interface RowsResult {
  rows: SearchAnalyticsRow[];
  truncated: boolean;
}

interface DimensionFetch {
  current: Fetched<RowsResult>;
  previous: Fetched<RowsResult> | null;
}

export interface RawGscData {
  totalsCurrent: SearchAnalyticsResponse;
  totalsPrevious: SearchAnalyticsResponse | null;
  dateCurrent: SearchAnalyticsRow[];
  datePrevious: SearchAnalyticsRow[] | null;
  query: DimensionFetch;
  page: DimensionFetch;
  country: DimensionFetch;
  device: DimensionFetch;
  searchAppearance: DimensionFetch;
}

export interface DatasetContext {
  client: SearchConsoleClient;
  siteUrl: string;
  period: ResolvedPeriod;
  freshness: DataFreshness;
  maxRowsPerDimension: number;
  signal?: AbortSignal;
}

/** Ejecuta tareas con un límite de concurrencia para respetar las cuotas de GSC. */
async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]!();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

/** Traduce errores de la API de GSC a errores de dominio. */
export function mapGscError(error: unknown, siteUrl: string): Error {
  if (error instanceof GscApiError) {
    if (error.status === 401) {
      return Errors.googleNotConnected('Google rejected the stored credentials. Reconnect your Google account.');
    }
    if (error.status === 403 || error.status === 404) return Errors.propertyInaccessible(siteUrl);
    if (error.status === 429) return Errors.gscApi('Search Console API quota exceeded. Try again in a few minutes.');
    return Errors.gscApi(`Search Console API error: ${error.message}`, { status: error.status, reason: error.reason });
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Descarga de GSC todos los datos necesarios para el periodo y su comparación (solo datos finales). */
export async function fetchRawData(ctx: DatasetContext): Promise<RawGscData> {
  const { client, siteUrl, period, maxRowsPerDimension } = ctx;
  const withPrevious = period.previousAvailability !== 'unavailable';

  const base = (range: DateRange) => ({
    startDate: range.startDate,
    endDate: range.endDate,
    type: 'web' as const,
    dataState: 'final' as const,
  });

  const essential = async (range: DateRange, dimensions?: GscDimension[]) => {
    try {
      return await client.querySearchAnalytics(siteUrl, {
        ...base(range),
        ...(dimensions ? { dimensions, rowLimit: 25_000 } : {}),
      });
    } catch (error) {
      throw mapGscError(error, siteUrl);
    }
  };

  const soft = async (range: DateRange, dimension: GscDimension, maxRows: number): Promise<Fetched<RowsResult>> => {
    try {
      return { ok: true, value: await client.queryAllRows(siteUrl, { ...base(range), dimensions: [dimension] }, maxRows) };
    } catch (error) {
      if (ctx.signal?.aborted) throw error;
      const mapped = mapGscError(error, siteUrl);
      // Errores de autenticación o acceso afectan a todo el reporte.
      if (isAppError(mapped) && (mapped.code === 'GOOGLE_NOT_CONNECTED' || mapped.code === 'GSC_PROPERTY_INACCESSIBLE')) {
        throw mapped;
      }
      return { ok: false, error: mapped.message };
    }
  };

  // Primero lo esencial (falla rápido si no hay acceso a la propiedad).
  const [totalsCurrent, totalsPrevious] = await Promise.all([
    essential(period.current),
    withPrevious ? essential(period.previous) : Promise.resolve(null),
  ]);
  const [dateCurrentRes, datePreviousRes] = await Promise.all([
    essential(period.current, ['date']),
    withPrevious ? essential(period.previous, ['date']) : Promise.resolve(null),
  ]);

  const dims: Array<{ name: keyof Pick<RawGscData, 'query' | 'page' | 'country' | 'device' | 'searchAppearance'>; dimension: GscDimension; maxRows: number }> = [
    { name: 'query', dimension: 'query', maxRows: maxRowsPerDimension },
    { name: 'page', dimension: 'page', maxRows: maxRowsPerDimension },
    { name: 'country', dimension: 'country', maxRows: 300 },
    { name: 'device', dimension: 'device', maxRows: 10 },
    // searchAppearance no puede combinarse con otras dimensiones: se consulta sola.
    { name: 'searchAppearance', dimension: 'searchAppearance', maxRows: 100 },
  ];

  const tasks: Array<() => Promise<{ name: string; which: 'current' | 'previous'; result: Fetched<RowsResult> }>> = [];
  for (const d of dims) {
    tasks.push(async () => ({ name: d.name, which: 'current', result: await soft(period.current, d.dimension, d.maxRows) }));
    if (withPrevious) {
      tasks.push(async () => ({ name: d.name, which: 'previous', result: await soft(period.previous, d.dimension, d.maxRows) }));
    }
  }
  const results = await runPool(tasks, 3);

  const pick = (name: string): DimensionFetch => {
    const current = results.find((r) => r.name === name && r.which === 'current')!.result;
    const previous = results.find((r) => r.name === name && r.which === 'previous')?.result ?? null;
    return { current, previous };
  };

  return {
    totalsCurrent,
    totalsPrevious,
    dateCurrent: dateCurrentRes.rows ?? [],
    datePrevious: datePreviousRes ? (datePreviousRes.rows ?? []) : null,
    query: pick('query'),
    page: pick('page'),
    country: pick('country'),
    device: pick('device'),
    searchAppearance: pick('searchAppearance'),
  };
}

export interface ProcessedMetrics {
  totals: ReportDataset['totals'];
  timeseries: ReportDataset['timeseries'];
}

/** Etapa "Processing metrics": totales, deltas y series temporales completas. */
export function processMetrics(raw: RawGscData, period: ResolvedPeriod): ProcessedMetrics {
  const current = toTotals(raw.totalsCurrent);
  const previous = raw.totalsPrevious ? toTotals(raw.totalsPrevious) : null;
  return {
    totals: { current, previous, deltas: computeTotalsDeltas(current, previous) },
    timeseries: {
      current: buildTimeseries(raw.dateCurrent, period.current),
      previous: raw.datePrevious ? buildTimeseries(raw.datePrevious, period.previous) : [],
    },
  };
}

function dimensionSection(
  fetch: DimensionFetch,
  totals: ProcessedMetrics['totals'],
): { analysis: DimensionAnalysis; truncated: boolean } {
  if (!fetch.current.ok) {
    return { analysis: emptyDimensionAnalysis('error', fetch.current.error), truncated: false };
  }
  const prevOk = fetch.previous && fetch.previous.ok ? fetch.previous.value : null;
  const analysis = analyzeDimension(
    toKeyedRows(fetch.current.value.rows),
    prevOk ? toKeyedRows(prevOk.rows) : null,
    totals.current,
    {
      truncated: fetch.current.value.truncated,
      hasComparison: Boolean(prevOk && totals.previous && totals.previous.impressions > 0),
    },
  );
  return { analysis, truncated: fetch.current.value.truncated };
}

function breakdownSection(fetch: DimensionFetch, totals: ProcessedMetrics['totals']): BreakdownSection {
  if (!fetch.current.ok) return { status: 'error', message: fetch.current.error, rows: [] };
  const prevOk = fetch.previous && fetch.previous.ok ? fetch.previous.value : null;
  return buildBreakdown(toKeyedRows(fetch.current.value.rows), prevOk ? toKeyedRows(prevOk.rows) : null, totals.current);
}

/** Etapa "Comparing periods": une periodos, detecta movers y oportunidades, y evalúa la calidad de datos. */
export function compareAndAssemble(
  raw: RawGscData,
  metrics: ProcessedMetrics,
  ctx: Pick<DatasetContext, 'siteUrl' | 'period' | 'freshness' | 'maxRowsPerDimension'>,
  stats: { gscRequests: number },
): ReportDataset {
  const queries = dimensionSection(raw.query, metrics.totals);
  const pages = dimensionSection(raw.page, metrics.totals);
  const issues: DataIssue[] = [];
  const { current, previous } = metrics.totals;
  const hasData = current.impressions > 0;

  if (!hasData) issues.push({ code: 'NO_DATA_CURRENT', severity: 'warning' });
  if (hasData && ctx.period.previousAvailability !== 'unavailable' && previous && previous.impressions === 0) {
    issues.push({ code: 'NO_DATA_PREVIOUS', severity: 'info' });
  }
  if (hasData && current.clicks < 50) issues.push({ code: 'LOW_VOLUME', severity: 'info', value: current.clicks });
  const coverage = queries.analysis.coverage.clicks;
  if (hasData && current.clicks > 0 && coverage !== null && coverage < 0.85) {
    issues.push({ code: 'ANONYMIZED_TRAFFIC', severity: 'info', value: 1 - coverage });
  }
  if (queries.truncated) issues.push({ code: 'ROWS_TRUNCATED', severity: 'info', dimension: 'query', value: ctx.maxRowsPerDimension });
  if (pages.truncated) issues.push({ code: 'ROWS_TRUNCATED', severity: 'info', dimension: 'page', value: ctx.maxRowsPerDimension });
  const sections: Array<[string, DimensionFetch]> = [
    ['query', raw.query],
    ['page', raw.page],
    ['country', raw.country],
    ['device', raw.device],
    ['searchAppearance', raw.searchAppearance],
  ];
  for (const [dimension, fetch] of sections) {
    if (!fetch.current.ok) issues.push({ code: 'SECTION_ERROR', severity: 'warning', dimension });
  }

  const rowsFetched = sections.reduce((sum, [, f]) => {
    const c = f.current.ok ? f.current.value.rows.length : 0;
    const p = f.previous && f.previous.ok ? f.previous.value.rows.length : 0;
    return sum + c + p;
  }, raw.dateCurrent.length + (raw.datePrevious?.length ?? 0));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    property: { siteUrl: ctx.siteUrl, propertyType: detectPropertyType(ctx.siteUrl) },
    period: ctx.period,
    freshness: ctx.freshness,
    totals: metrics.totals,
    timeseries: metrics.timeseries,
    queries: queries.analysis,
    pages: pages.analysis,
    countries: breakdownSection(raw.country, metrics.totals),
    devices: breakdownSection(raw.device, metrics.totals),
    searchAppearance: breakdownSection(raw.searchAppearance, metrics.totals),
    dataQuality: {
      hasData,
      issues,
      warnings: issues.filter((i) => i.severity === 'warning').map((i) => formatDataIssue(i, 'en')),
      notes: issues.filter((i) => i.severity === 'info').map((i) => formatDataIssue(i, 'en')),
    },
    stats: { gscRequests: stats.gscRequests, rowsFetched },
  };
}

/** Construye el dataset completo (usado por la vista de rendimiento en vivo). */
export async function buildDataset(ctx: DatasetContext): Promise<ReportDataset> {
  const raw = await fetchRawData(ctx);
  const metrics = processMetrics(raw, ctx.period);
  return compareAndAssemble(raw, metrics, ctx, { gscRequests: ctx.client.requestCount });
}
