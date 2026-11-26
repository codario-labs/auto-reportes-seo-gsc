export const METRIC_KEYS = ['clicks', 'impressions', 'ctr', 'position'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** Totales agregados. CTR y posición son null cuando no hubo impresiones. */
export interface MetricTotals {
  clicks: number;
  impressions: number;
  /** Fracción (0.034 = 3,4 %), igual que la API de Search Console. */
  ctr: number | null;
  position: number | null;
}

/** Métricas de una fila de dimensión (GSC siempre devuelve las cuatro). */
export interface MetricValues {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface MetricMeta {
  label: string;
  labelEs: string;
  longLabel: string;
  longLabelEs: string;
  /** Para posición media, un valor menor es mejor. */
  higherIsBetter: boolean;
  kind: 'count' | 'ratio' | 'position';
}

export const METRIC_META: Record<MetricKey, MetricMeta> = {
  clicks: {
    label: 'Clicks',
    labelEs: 'Clics',
    longLabel: 'Total clicks',
    longLabelEs: 'Clics totales',
    higherIsBetter: true,
    kind: 'count',
  },
  impressions: {
    label: 'Impressions',
    labelEs: 'Impresiones',
    longLabel: 'Total impressions',
    longLabelEs: 'Impresiones totales',
    higherIsBetter: true,
    kind: 'count',
  },
  ctr: {
    label: 'CTR',
    labelEs: 'CTR',
    longLabel: 'Average CTR',
    longLabelEs: 'CTR medio',
    higherIsBetter: true,
    kind: 'ratio',
  },
  position: {
    label: 'Position',
    labelEs: 'Posición',
    longLabel: 'Average position',
    longLabelEs: 'Posición media',
    higherIsBetter: false,
    kind: 'position',
  },
};

/** Paleta de series (propia, inspirada en la legibilidad de GSC). */
export const METRIC_COLORS: Record<MetricKey, string> = {
  clicks: '#2F5BD3',
  impressions: '#6E46C9',
  ctr: '#0E8A78',
  position: '#D9620B',
};

export type TrendDirection = 'up' | 'down' | 'flat';
export type TrendSentiment = 'positive' | 'negative' | 'neutral';

export interface MetricDelta {
  metric: MetricKey;
  current: number | null;
  previous: number | null;
  /** Diferencia absoluta (para CTR, en fracción: 0.004 = 0,4 pp). */
  absoluteChange: number | null;
  /** Variación relativa en fracción (0.12 = +12 %). null si el valor anterior es 0. */
  percentChange: number | null;
  direction: TrendDirection;
  sentiment: TrendSentiment;
}

const FLAT_EPSILON: Record<MetricKey, number> = {
  clicks: 0,
  impressions: 0,
  ctr: 0.00005,
  position: 0.05,
};

export function computeDelta(metric: MetricKey, current: number | null, previous: number | null): MetricDelta {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return {
      metric,
      current,
      previous,
      absoluteChange: null,
      percentChange: null,
      direction: 'flat',
      sentiment: 'neutral',
    };
  }
  const absoluteChange = current - previous;
  const percentChange = previous === 0 ? null : absoluteChange / Math.abs(previous);
  const isFlat = Math.abs(absoluteChange) <= FLAT_EPSILON[metric];
  const direction: TrendDirection = isFlat ? 'flat' : absoluteChange > 0 ? 'up' : 'down';
  let sentiment: TrendSentiment = 'neutral';
  if (direction !== 'flat') {
    const improved = METRIC_META[metric].higherIsBetter ? direction === 'up' : direction === 'down';
    sentiment = improved ? 'positive' : 'negative';
  }
  return { metric, current, previous, absoluteChange, percentChange, direction, sentiment };
}

export function computeTotalsDeltas(current: MetricTotals, previous: MetricTotals | null): MetricDelta[] {
  return METRIC_KEYS.map((metric) => computeDelta(metric, current[metric], previous ? previous[metric] : null));
}

export function deriveCtr(clicks: number, impressions: number): number | null {
  return impressions > 0 ? clicks / impressions : null;
}

export function emptyTotals(): MetricTotals {
  return { clicks: 0, impressions: 0, ctr: null, position: null };
}

// ---------------------------------------------------------------------------
// Formato numérico
// ---------------------------------------------------------------------------

export type NumberLocale = 'en' | 'es';

const LOCALE_TAG: Record<NumberLocale, string> = { en: 'en-US', es: 'es-ES' };

const formatterCache = new Map<string, Intl.NumberFormat>();

function nf(locale: NumberLocale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    // useGrouping "always" fuerza separador de miles también en números de 4 cifras (es-ES).
    formatter = new Intl.NumberFormat(LOCALE_TAG[locale], {
      ...options,
      useGrouping: 'always',
    } as Intl.NumberFormatOptions);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

const MINUS = '−';

function signed(value: number, text: string): string {
  if (value > 0) return `+${text}`;
  if (value < 0) return `${MINUS}${text.replace(/^[-−]/, '')}`;
  return text;
}

export function formatInteger(value: number, locale: NumberLocale = 'en'): string {
  return nf(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function formatCompact(value: number, locale: NumberLocale = 'en'): string {
  if (Math.abs(value) < 10_000) return formatInteger(value, locale);
  return nf(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Fracción a porcentaje: 0.0345 → "3.45%" / "3,45 %". */
export function formatPercent(fraction: number, locale: NumberLocale = 'en', digits = 2): string {
  return nf(locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(fraction);
}

export function formatPosition(value: number, locale: NumberLocale = 'en'): string {
  return nf(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

export function formatMetricValue(metric: MetricKey, value: number | null, locale: NumberLocale = 'en'): string {
  if (value === null || !Number.isFinite(value)) return '—';
  switch (metric) {
    case 'clicks':
    case 'impressions':
      return formatInteger(value, locale);
    case 'ctr':
      return formatPercent(value, locale, value < 0.1 ? 2 : 1);
    case 'position':
      return formatPosition(value, locale);
  }
}

export function formatMetricValueCompact(metric: MetricKey, value: number | null, locale: NumberLocale = 'en'): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (metric === 'clicks' || metric === 'impressions') return formatCompact(value, locale);
  return formatMetricValue(metric, value, locale);
}

/** Variación relativa: 0.123 → "+12.3%". */
export function formatPercentChange(fraction: number | null, locale: NumberLocale = 'en'): string {
  if (fraction === null || !Number.isFinite(fraction)) return locale === 'es' ? 'n/d' : 'n/a';
  const abs = Math.abs(fraction);
  const digits = abs >= 10 ? 0 : 1;
  const text = nf(locale, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(abs);
  return signed(fraction, text);
}

/** Diferencia absoluta con unidades: clics "+1,234", CTR "+0.42 pp", posición "−1.3". */
export function formatAbsoluteChange(metric: MetricKey, value: number | null, locale: NumberLocale = 'en'): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  switch (metric) {
    case 'clicks':
    case 'impressions':
      return signed(Math.round(value), formatInteger(abs, locale));
    case 'ctr':
      return signed(value, `${nf(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs * 100)} pp`);
    case 'position':
      return signed(value, formatPosition(abs, locale));
  }
}
