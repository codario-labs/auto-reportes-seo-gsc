import {
  formatDataIssue,
  formatPeriodNote,
  METRIC_KEYS,
  PERIOD_PRESET_LABELS_ES,
  countryName,
  deviceLabel,
  searchAppearanceLabel,
  type ComparedRow,
  type OpportunityRow,
  type ReportDataset,
  type TimeseriesPoint,
} from '@codario/shared';

/**
 * Reduce el dataset a una representación compacta (tablas columnares, números redondeados)
 * para minimizar tokens sin perder la información relevante para el análisis.
 */

const r1 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
const r2 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
const pct = (fraction: number | null | undefined) => (fraction === null || fraction === undefined ? null : r2(fraction * 100));

interface Table {
  columnas: string[];
  filas: Array<Array<string | number | null>>;
}

const COMPARED_COLUMNS = [
  'clave',
  'clics',
  'impresiones',
  'ctr_%',
  'posicion',
  'clics_prev',
  'impresiones_prev',
  'posicion_prev',
  'delta_clics',
  'delta_clics_%',
];

function comparedTable(rows: ComparedRow[], label?: (key: string) => string): Table {
  return {
    columnas: COMPARED_COLUMNS,
    filas: rows.map((r) => [
      label ? label(r.key) : r.key,
      r.current?.clicks ?? 0,
      r.current?.impressions ?? 0,
      pct(r.current?.ctr ?? null),
      r1(r.current?.position ?? null),
      r.previous?.clicks ?? null,
      r.previous?.impressions ?? null,
      r1(r.previous?.position ?? null),
      r.change.clicks,
      pct(r.change.clicksPct),
    ]),
  };
}

function opportunityTable(rows: OpportunityRow[]): Table {
  return {
    columnas: ['clave', 'clics', 'impresiones', 'ctr_%', 'posicion', 'ctr_referencia_sitio_%', 'clics_potenciales_estimados'],
    filas: rows.map((r) => [r.key, r.clicks, r.impressions, pct(r.ctr), r1(r.position), pct(r.benchmarkCtr), r.estimatedClickGap]),
  };
}

/** Serie diaria; si el periodo es largo se agrega por semanas para ahorrar tokens. */
function seriesTable(points: TimeseriesPoint[]): Table {
  if (points.length <= 62) {
    return {
      columnas: ['fecha', 'clics', 'impresiones', 'ctr_%', 'posicion'],
      filas: points.map((p) => [p.date, p.clicks, p.impressions, pct(p.ctr), r1(p.position)]),
    };
  }
  const weeks: Table['filas'] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    const clicks = chunk.reduce((s, p) => s + p.clicks, 0);
    const impressions = chunk.reduce((s, p) => s + p.impressions, 0);
    const posWeighted = chunk.reduce((s, p) => s + (p.position ?? 0) * p.impressions, 0);
    weeks.push([
      `${chunk[0]!.date}..${chunk[chunk.length - 1]!.date}`,
      clicks,
      impressions,
      impressions > 0 ? pct(clicks / impressions) : null,
      impressions > 0 ? r1(posWeighted / impressions) : null,
    ]);
  }
  return { columnas: ['semana', 'clics', 'impresiones', 'ctr_%', 'posicion'], filas: weeks };
}

export interface AnalysisContext {
  marketName: string;
  domain: string;
  description: string | null;
}

export interface AnalysisPayload {
  payload: Record<string, unknown>;
  /** Claves (consultas y URLs) presentes en el payload: única fuente válida para referencias de la IA. */
  knownQueries: Set<string>;
  knownPages: Set<string>;
}

export function buildAnalysisPayload(dataset: ReportDataset, context: AnalysisContext): AnalysisPayload {
  const q = dataset.queries;
  const p = dataset.pages;
  const queryRows = {
    top: q.top.slice(0, 25),
    gainers: q.gainers.slice(0, 12),
    losers: q.losers.slice(0, 12),
    newItems: q.newItems.slice(0, 10),
    lostItems: q.lostItems.slice(0, 10),
    lowCtr: q.lowCtr.slice(0, 12),
    striking: q.strikingDistance.slice(0, 12),
  };
  const pageRows = {
    top: p.top.slice(0, 20),
    gainers: p.gainers.slice(0, 10),
    losers: p.losers.slice(0, 10),
    newItems: p.newItems.slice(0, 8),
    lostItems: p.lostItems.slice(0, 8),
    lowCtr: p.lowCtr.slice(0, 10),
    striking: p.strikingDistance.slice(0, 10),
  };

  const knownQueries = new Set<string>();
  const knownPages = new Set<string>();
  for (const list of Object.values(queryRows)) for (const row of list) knownQueries.add(row.key);
  for (const list of Object.values(pageRows)) for (const row of list) knownPages.add(row.key);

  const totals = Object.fromEntries(
    METRIC_KEYS.map((metric) => {
      const d = dataset.totals.deltas.find((x) => x.metric === metric)!;
      const isCtr = metric === 'ctr';
      return [
        metric,
        {
          actual: isCtr ? pct(d.current) : metric === 'position' ? r2(d.current) : d.current,
          anterior: isCtr ? pct(d.previous) : metric === 'position' ? r2(d.previous) : d.previous,
          cambio_absoluto: isCtr ? r2(d.absoluteChange === null ? null : d.absoluteChange * 100) : r2(d.absoluteChange),
          cambio_porcentual: pct(d.percentChange),
          valoracion: d.sentiment === 'positive' ? 'mejora' : d.sentiment === 'negative' ? 'empeora' : 'sin cambio relevante',
        },
      ];
    }),
  );

  const payload = {
    sitio: {
      market: context.marketName,
      dominio: context.domain,
      descripcion_negocio: context.description,
      propiedad_search_console: dataset.property.siteUrl,
      tipo_propiedad: dataset.property.propertyType === 'DOMAIN' ? 'dominio' : 'prefijo de URL',
    },
    periodo: {
      preset: PERIOD_PRESET_LABELS_ES[dataset.period.preset],
      actual: { ...dataset.period.current, dias: dataset.period.days },
      comparacion: {
        ...dataset.period.previous,
        dias: dataset.period.previousDays,
        disponibilidad: dataset.period.previousAvailability,
      },
      periodo_parcial: dataset.period.isPartial,
      ultimo_dia_con_datos_finales: dataset.freshness.latestAvailableDate,
      notas: dataset.period.notes.map((n) => formatPeriodNote(n, 'es')),
    },
    unidades: 'ctr en %, cambio_absoluto de ctr en puntos porcentuales, posicion media (menor es mejor)',
    totales: totals,
    serie_actual: seriesTable(dataset.timeseries.current),
    serie_anterior: dataset.timeseries.previous.length > 0 ? seriesTable(dataset.timeseries.previous) : null,
    consultas: {
      estado: q.status,
      filas_analizadas: q.totalRows,
      truncado: q.truncated,
      cobertura_clics_pct: pct(q.coverage.clicks),
      top_por_clics: comparedTable(queryRows.top),
      mayor_crecimiento: comparedTable(queryRows.gainers),
      mayor_caida: comparedTable(queryRows.losers),
      nuevas: comparedTable(queryRows.newItems),
      perdidas: comparedTable(queryRows.lostItems),
      ctr_bajo_vs_referencia_del_sitio: opportunityTable(queryRows.lowCtr),
      posiciones_8_a_20: opportunityTable(queryRows.striking),
    },
    paginas: {
      estado: p.status,
      filas_analizadas: p.totalRows,
      truncado: p.truncated,
      top_por_clics: comparedTable(pageRows.top),
      mayor_crecimiento: comparedTable(pageRows.gainers),
      mayor_caida: comparedTable(pageRows.losers),
      nuevas: comparedTable(pageRows.newItems),
      perdidas: comparedTable(pageRows.lostItems),
      ctr_bajo_vs_referencia_del_sitio: opportunityTable(pageRows.lowCtr),
      posiciones_8_a_20: opportunityTable(pageRows.striking),
    },
    paises: {
      estado: dataset.countries.status,
      datos: comparedTable(dataset.countries.rows.slice(0, 10), (k) => countryName(k, 'es')),
    },
    dispositivos: {
      estado: dataset.devices.status,
      datos: comparedTable(dataset.devices.rows, (k) => deviceLabel(k, 'es')),
    },
    apariencia_en_busqueda: {
      estado: dataset.searchAppearance.status,
      datos: comparedTable(dataset.searchAppearance.rows.slice(0, 10), (k) => searchAppearanceLabel(k, 'es')),
    },
    calidad_de_datos: dataset.dataQuality.issues.map((i) => formatDataIssue(i, 'es')),
  };

  return { payload, knownQueries, knownPages };
}
