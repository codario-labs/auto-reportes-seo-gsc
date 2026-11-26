import {
  deriveCtr,
  emptyChange,
  enumerateDates,
  type BreakdownSection,
  type ComparedRow,
  type DateRange,
  type DimensionAnalysis,
  type MetricChange,
  type MetricTotals,
  type MetricValues,
  type OpportunityRow,
  type TimeseriesPoint,
} from '@codario/shared';
import type { SearchAnalyticsResponse, SearchAnalyticsRow } from '../gsc/gsc.client';

/**
 * Transformaciones puras de las respuestas de Search Console.
 * Nunca se inventan valores: un día sin fila en datos finales significa 0 impresiones,
 * y CTR/posición quedan en null cuando no hay impresiones.
 */

export interface KeyedRow extends MetricValues {
  key: string;
}

export function toKeyedRows(rows: SearchAnalyticsRow[] | undefined, keyIndex = 0): KeyedRow[] {
  return (rows ?? [])
    .filter((row) => row.keys && row.keys[keyIndex] !== undefined)
    .map((row) => ({
      key: row.keys![keyIndex]!,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }));
}

/** Totales de una consulta sin dimensiones (agregado por propiedad). */
export function toTotals(response: SearchAnalyticsResponse | null | undefined): MetricTotals {
  const row = response?.rows?.[0];
  if (!row || row.impressions <= 0) {
    return { clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0, ctr: null, position: null };
  }
  return { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
}

/** Serie diaria completa para el rango (rellena días sin filas como 0 impresiones, sin CTR/posición). */
export function buildTimeseries(rows: SearchAnalyticsRow[] | undefined, range: DateRange): TimeseriesPoint[] {
  const byDate = new Map(toKeyedRows(rows).map((r) => [r.key, r]));
  return enumerateDates(range.startDate, range.endDate).map((date) => {
    const row = byDate.get(date);
    if (!row) return { date, clicks: 0, impressions: 0, ctr: null, position: null, hasData: false };
    return {
      date,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions > 0 ? row.ctr : null,
      position: row.impressions > 0 ? row.position : null,
      hasData: true,
    };
  });
}

function pct(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}

export function computeChange(current: MetricValues | null, previous: MetricValues | null): MetricChange {
  if (!current && !previous) return emptyChange();
  const c = current ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const p = previous ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return {
    clicks: c.clicks - p.clicks,
    impressions: c.impressions - p.impressions,
    // CTR y posición solo son comparables si la fila existe en ambos periodos.
    ctr: current && previous ? c.ctr - p.ctr : null,
    position: current && previous ? c.position - p.position : null,
    clicksPct: pct(c.clicks, p.clicks),
    impressionsPct: pct(c.impressions, p.impressions),
  };
}

function strip(row: KeyedRow): MetricValues {
  return { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
}

/** Une filas de ambos periodos por clave. Si no hay periodo previo, `previous` es null en todas. */
export function compareRows(
  current: KeyedRow[],
  previous: KeyedRow[] | null,
  totals?: MetricTotals,
): ComparedRow[] {
  const prevMap = new Map((previous ?? []).map((r) => [r.key, r]));
  const out: ComparedRow[] = [];
  const seen = new Set<string>();
  for (const row of current) {
    seen.add(row.key);
    const prev = prevMap.get(row.key) ?? null;
    out.push({
      key: row.key,
      current: strip(row),
      previous: prev ? strip(prev) : null,
      change: previous ? computeChange(strip(row), prev ? strip(prev) : null) : emptyChange(),
      clickShare: totals && totals.clicks > 0 ? row.clicks / totals.clicks : null,
      impressionShare: totals && totals.impressions > 0 ? row.impressions / totals.impressions : null,
    });
  }
  if (previous) {
    for (const prev of previous) {
      if (seen.has(prev.key)) continue;
      out.push({
        key: prev.key,
        current: null,
        previous: strip(prev),
        change: computeChange(null, strip(prev)),
        clickShare: 0,
        impressionShare: 0,
      });
    }
  }
  return out;
}

const byClicksDesc = (a: ComparedRow, b: ComparedRow) =>
  (b.current?.clicks ?? 0) - (a.current?.clicks ?? 0) || (b.current?.impressions ?? 0) - (a.current?.impressions ?? 0);

/** Rangos de posición para calcular el CTR de referencia con los datos del propio sitio. */
const POSITION_BUCKETS: Array<[number, number]> = [
  [0, 3],
  [3, 5],
  [5, 10],
  [10, 20],
  [20, Number.POSITIVE_INFINITY],
];

function bucketIndex(position: number): number {
  return POSITION_BUCKETS.findIndex(([min, max]) => position > min && position <= max);
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx]!;
}

/**
 * CTR de referencia por rango de posición: CTR ponderado de las filas del propio sitio
 * (no se usan benchmarks externos inventados).
 */
export function computeBenchmarkCtr(rows: KeyedRow[], minImpressions: number): number[] {
  const sums = POSITION_BUCKETS.map(() => ({ clicks: 0, impressions: 0, count: 0 }));
  for (const row of rows) {
    if (row.impressions < minImpressions) continue;
    const idx = bucketIndex(row.position);
    if (idx < 0) continue;
    sums[idx]!.clicks += row.clicks;
    sums[idx]!.impressions += row.impressions;
    sums[idx]!.count += 1;
  }
  // Se exige un mínimo de filas por rango para que la referencia sea estable.
  return sums.map((s) => (s.count >= 3 && s.impressions > 0 ? s.clicks / s.impressions : 0));
}

export interface AnalyzeDimensionOptions {
  topN?: number;
  moversN?: number;
  opportunitiesN?: number;
  truncated?: boolean;
  /** Si es false (sin datos de comparación), no se calculan nuevos/perdidos ni movers. */
  hasComparison: boolean;
}

export function analyzeDimension(
  currentRows: KeyedRow[],
  previousRows: KeyedRow[] | null,
  totals: MetricTotals,
  options: AnalyzeDimensionOptions,
): DimensionAnalysis {
  const topN = options.topN ?? 25;
  const moversN = options.moversN ?? 15;
  const oppN = options.opportunitiesN ?? 15;
  const compared = compareRows(currentRows, options.hasComparison ? previousRows : null, totals);
  const present = compared.filter((r) => r.current);

  const top = [...present].sort(byClicksDesc).slice(0, topN);

  let gainers: ComparedRow[] = [];
  let losers: ComparedRow[] = [];
  let newItems: ComparedRow[] = [];
  let lostItems: ComparedRow[] = [];
  if (options.hasComparison && previousRows) {
    gainers = compared
      .filter((r) => (r.change.clicks ?? 0) > 0)
      .sort((a, b) => (b.change.clicks ?? 0) - (a.change.clicks ?? 0) || (b.change.impressions ?? 0) - (a.change.impressions ?? 0))
      .slice(0, moversN);
    losers = compared
      .filter((r) => (r.change.clicks ?? 0) < 0)
      .sort((a, b) => (a.change.clicks ?? 0) - (b.change.clicks ?? 0) || (a.change.impressions ?? 0) - (b.change.impressions ?? 0))
      .slice(0, moversN);
    newItems = compared
      .filter((r) => r.current && !r.previous && r.current.impressions > 0)
      .sort((a, b) => (b.current?.clicks ?? 0) - (a.current?.clicks ?? 0) || (b.current?.impressions ?? 0) - (a.current?.impressions ?? 0))
      .slice(0, moversN);
    lostItems = compared
      .filter((r) => !r.current && r.previous)
      .sort((a, b) => (b.previous?.clicks ?? 0) - (a.previous?.clicks ?? 0) || (b.previous?.impressions ?? 0) - (a.previous?.impressions ?? 0))
      .slice(0, moversN);
  }

  // Umbrales adaptativos al volumen del sitio.
  const impressions = currentRows.map((r) => r.impressions);
  const benchmarkMinImpr = Math.max(10, quantile(impressions, 0.5));
  const benchmark = computeBenchmarkCtr(currentRows, benchmarkMinImpr);
  const lowCtrMinImpr = Math.max(50, quantile(impressions, 0.8));

  const lowCtr: OpportunityRow[] = currentRows
    .filter((r) => r.impressions >= lowCtrMinImpr && r.position <= 20)
    .map((r) => {
      const idx = bucketIndex(r.position);
      const ref = idx >= 0 ? benchmark[idx]! : 0;
      return {
        key: r.key,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        benchmarkCtr: ref > 0 ? ref : null,
        estimatedClickGap: ref > 0 ? Math.max(0, Math.round(r.impressions * ref - r.clicks)) : null,
      };
    })
    .filter((r) => r.benchmarkCtr !== null && r.ctr < r.benchmarkCtr * 0.5 && (r.estimatedClickGap ?? 0) >= 1)
    .sort((a, b) => (b.estimatedClickGap ?? 0) - (a.estimatedClickGap ?? 0))
    .slice(0, oppN);

  const strikingMinImpr = Math.max(10, quantile(impressions, 0.5));
  const strikingDistance: OpportunityRow[] = currentRows
    .filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= strikingMinImpr)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, oppN)
    .map((r) => {
      const idx = bucketIndex(r.position);
      return {
        key: r.key,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        benchmarkCtr: idx >= 0 && benchmark[idx]! > 0 ? benchmark[idx]! : null,
        estimatedClickGap: null,
      };
    });

  const rowClicks = currentRows.reduce((s, r) => s + r.clicks, 0);
  const rowImpr = currentRows.reduce((s, r) => s + r.impressions, 0);

  return {
    status: currentRows.length > 0 ? 'ok' : 'empty',
    totalRows: currentRows.length,
    truncated: Boolean(options.truncated),
    top,
    gainers,
    losers,
    newItems,
    lostItems,
    lowCtr,
    strikingDistance,
    coverage: {
      clicks: totals.clicks > 0 ? Math.min(1, rowClicks / totals.clicks) : null,
      impressions: totals.impressions > 0 ? Math.min(1, rowImpr / totals.impressions) : null,
    },
  };
}

export function emptyDimensionAnalysis(status: 'empty' | 'error', message?: string): DimensionAnalysis {
  return {
    status,
    ...(message ? { message } : {}),
    totalRows: 0,
    truncated: false,
    top: [],
    gainers: [],
    losers: [],
    newItems: [],
    lostItems: [],
    lowCtr: [],
    strikingDistance: [],
    coverage: { clicks: null, impressions: null },
  };
}

export function buildBreakdown(
  currentRows: KeyedRow[],
  previousRows: KeyedRow[] | null,
  totals: MetricTotals,
  limit = 50,
): BreakdownSection {
  if (currentRows.length === 0 && (!previousRows || previousRows.length === 0)) {
    return { status: 'empty', rows: [] };
  }
  const rows = compareRows(currentRows, previousRows, totals)
    .filter((r) => r.current)
    .sort(byClicksDesc)
    .slice(0, limit);
  return { status: rows.length > 0 ? 'ok' : 'empty', rows };
}

/** Totales recalculados a partir de una serie (útil para validar coherencia). */
export function totalsFromTimeseries(points: TimeseriesPoint[]): MetricTotals {
  const clicks = points.reduce((s, p) => s + p.clicks, 0);
  const impressions = points.reduce((s, p) => s + p.impressions, 0);
  const weightedPosition = points.reduce((s, p) => s + (p.position ?? 0) * p.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: deriveCtr(clicks, impressions),
    position: impressions > 0 ? weightedPosition / impressions : null,
  };
}
