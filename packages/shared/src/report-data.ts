import type { IsoDate } from './dates';
import type { MetricDelta, MetricTotals, MetricValues } from './metrics';
import type { ResolvedPeriod } from './periods';

export type GscPropertyType = 'DOMAIN' | 'URL_PREFIX';

/**
 * Estado de una sección de datos:
 * - ok: hay filas.
 * - empty: la consulta funcionó pero GSC no devolvió filas (cero resultados reales).
 * - error: la consulta falló (no confundir con "sin datos").
 */
export type SectionStatus = 'ok' | 'empty' | 'error';

export interface MetricChange {
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  clicksPct: number | null;
  impressionsPct: number | null;
}

/** Fila de una dimensión con el periodo actual, el anterior y la variación. */
export interface ComparedRow {
  key: string;
  current: MetricValues | null;
  previous: MetricValues | null;
  change: MetricChange;
  /** Participación de clics en el periodo actual (0..1), si aplica. */
  clickShare?: number | null;
  /** Participación de impresiones en el periodo actual (0..1), si aplica. */
  impressionShare?: number | null;
}

export interface OpportunityRow extends MetricValues {
  key: string;
  /** CTR de referencia calculado con los propios datos del sitio para ese rango de posición. */
  benchmarkCtr: number | null;
  /** Clics adicionales estimados si se alcanzara el CTR de referencia (estimación, no un dato). */
  estimatedClickGap: number | null;
}

export interface TimeseriesPoint {
  date: IsoDate;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  /** false cuando GSC no devolvió fila para ese día (0 impresiones en datos finales). */
  hasData: boolean;
}

export interface DimensionAnalysis {
  status: SectionStatus;
  message?: string;
  /** Filas obtenidas del periodo actual. */
  totalRows: number;
  /** true si se alcanzó el límite configurado de filas y podría haber más. */
  truncated: boolean;
  top: ComparedRow[];
  gainers: ComparedRow[];
  losers: ComparedRow[];
  newItems: ComparedRow[];
  lostItems: ComparedRow[];
  lowCtr: OpportunityRow[];
  strikingDistance: OpportunityRow[];
  /** Clics/impresiones cubiertos por las filas frente a los totales (consultas anonimizadas). */
  coverage: { clicks: number | null; impressions: number | null };
}

export interface BreakdownSection {
  status: SectionStatus;
  message?: string;
  rows: ComparedRow[];
}

export interface DataFreshness {
  latestAvailableDate: IsoDate;
  source: 'gsc_metadata' | 'estimated';
  firstIncompleteDate: IsoDate | null;
  dataState: 'final';
  checkedAt: string;
}

export type DataIssueCode =
  | 'NO_DATA_CURRENT'
  | 'NO_DATA_PREVIOUS'
  | 'LOW_VOLUME'
  | 'ANONYMIZED_TRAFFIC'
  | 'ROWS_TRUNCATED'
  | 'SECTION_ERROR';

/** Incidencia de calidad de datos (estructurada para poder mostrarse en cualquier idioma). */
export interface DataIssue {
  code: DataIssueCode;
  severity: 'info' | 'warning';
  /** Dimensión afectada (query, page, country, device, searchAppearance). */
  dimension?: string;
  /** Valor asociado: fracción (tráfico anonimizado), número de filas, clics… */
  value?: number;
}

const DIMENSION_NAMES: Record<string, { en: string; es: string }> = {
  query: { en: 'queries', es: 'consultas' },
  page: { en: 'pages', es: 'páginas' },
  country: { en: 'countries', es: 'países' },
  device: { en: 'devices', es: 'dispositivos' },
  searchAppearance: { en: 'search appearance', es: 'apariencia en búsqueda' },
};

export function formatDataIssue(issue: DataIssue, lang: 'en' | 'es' = 'en'): string {
  const dim = issue.dimension ? (DIMENSION_NAMES[issue.dimension]?.[lang] ?? issue.dimension) : '';
  const pct = issue.value !== undefined ? `${Math.round(issue.value * 100)}%` : '';
  const num = issue.value !== undefined ? new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-US').format(issue.value) : '';
  if (lang === 'es') {
    switch (issue.code) {
      case 'NO_DATA_CURRENT':
        return 'Search Console no registró impresiones en el periodo analizado.';
      case 'NO_DATA_PREVIOUS':
        return 'Search Console no registró impresiones en el periodo de comparación; las variaciones no son calculables.';
      case 'LOW_VOLUME':
        return `Volumen bajo (${num} clics): las variaciones porcentuales pueden no ser representativas.`;
      case 'ANONYMIZED_TRAFFIC':
        return `El ${pct} de los clics no está atribuido a consultas concretas (consultas anonimizadas por Google).`;
      case 'ROWS_TRUNCATED':
        return `Se analizaron las primeras ${num} filas de ${dim}; puede haber elementos con menos tráfico no incluidos.`;
      case 'SECTION_ERROR':
        return `No se pudieron obtener los datos de ${dim} desde Search Console.`;
    }
  }
  switch (issue.code) {
    case 'NO_DATA_CURRENT':
      return 'Search Console recorded no impressions in the selected period.';
    case 'NO_DATA_PREVIOUS':
      return 'Search Console recorded no impressions in the comparison period; changes cannot be calculated.';
    case 'LOW_VOLUME':
      return `Low volume (${num} clicks): percentage changes may not be meaningful.`;
    case 'ANONYMIZED_TRAFFIC':
      return `${pct} of clicks are not attributed to specific queries (anonymized by Google).`;
    case 'ROWS_TRUNCATED':
      return `Only the first ${num} ${dim} rows were analyzed; lower-traffic items may be missing.`;
    case 'SECTION_ERROR':
      return `Search Console data for ${dim} could not be retrieved.`;
  }
}

export interface ReportDataset {
  version: 1;
  generatedAt: string;
  property: { siteUrl: string; propertyType: GscPropertyType };
  period: ResolvedPeriod;
  freshness: DataFreshness;
  totals: {
    current: MetricTotals;
    previous: MetricTotals | null;
    deltas: MetricDelta[];
  };
  timeseries: {
    current: TimeseriesPoint[];
    previous: TimeseriesPoint[];
  };
  queries: DimensionAnalysis;
  pages: DimensionAnalysis;
  countries: BreakdownSection;
  devices: BreakdownSection;
  searchAppearance: BreakdownSection;
  dataQuality: {
    /** false si GSC no devolvió ninguna impresión en el periodo actual. */
    hasData: boolean;
    /** Incidencias estructuradas (usar formatDataIssue para mostrarlas). */
    issues: DataIssue[];
    /** Incidencias de severidad "warning", ya formateadas en inglés (UI). */
    warnings: string[];
    /** Incidencias informativas, ya formateadas en inglés (UI). */
    notes: string[];
  };
  stats: {
    gscRequests: number;
    rowsFetched: number;
  };
}

export function emptyChange(): MetricChange {
  return { clicks: null, impressions: null, ctr: null, position: null, clicksPct: null, impressionsPct: null };
}

/** Tipo de propiedad a partir de la URL de GSC ("sc-domain:" = propiedad de dominio). */
export function detectPropertyType(siteUrl: string): GscPropertyType {
  return siteUrl.startsWith('sc-domain:') ? 'DOMAIN' : 'URL_PREFIX';
}

/** "sc-domain:example.com" → "example.com"; "https://www.example.com/" → "www.example.com". */
export function propertyDisplayName(siteUrl: string): string {
  if (siteUrl.startsWith('sc-domain:')) return siteUrl.slice('sc-domain:'.length);
  try {
    const url = new URL(siteUrl);
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    return `${url.host}${path}`;
  } catch {
    return siteUrl;
  }
}
