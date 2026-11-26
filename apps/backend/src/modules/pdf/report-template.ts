import {
  comparisonLabel,
  countryName,
  describeRange,
  deviceLabel,
  formatAbsoluteChange,
  formatDataIssue,
  formatDateLong,
  formatMetricValue,
  formatPercent,
  formatPercentChange,
  formatPeriodNote,
  METRIC_COLORS,
  METRIC_KEYS,
  METRIC_META,
  OVERALL_STATUS_LABELS,
  PERIOD_PRESET_LABELS_ES,
  PRIORITY_LABELS,
  PRIORITY_LEVELS,
  ROADMAP_HORIZON_LABELS,
  ROADMAP_HORIZONS,
  searchAppearanceLabel,
  todayInTimeZone,
  type AiAnalysis,
  type AiAnalysisMeta,
  type AiFinding,
  type BreakdownSection,
  type ComparedRow,
  type DimensionAnalysis,
  type MetricDelta,
  type MetricKey,
  type OpportunityRow,
  type ReportDataset,
  type TemplateConfig,
} from '@codario/shared';
import { comparisonChart, donutChart, sparkline, trendChart, type ChartTheme, type LineSeries } from './charts';
import { fontFaceCss, fontStack } from './fonts';
import { cssColor, escapeHtml, html, join, raw, readableTextOn, tint, type SafeHtml } from './html';

export interface ReportRenderModel {
  mode: 'pdf' | 'preview';
  dataset: ReportDataset | null;
  analysis: AiAnalysis | null;
  aiMeta: AiAnalysisMeta | null;
  includeAi: boolean;
  market: {
    name: string;
    domain: string;
    description: string | null;
    logoDataUri: string | null;
    primaryColor: string;
    secondaryColor: string;
  };
  template: TemplateConfig;
  branding: { companyName: string; logoDataUri: string | null };
  generatedAt: Date;
  timezone: string;
}

export interface RenderedReport {
  coverHtml: string;
  bodyHtml: string;
  headerTemplate: string;
  footerTemplate: string;
  /** Márgenes de página del cuerpo (mm). */
  margins: { top: string; bottom: string; left: string; right: string };
  title: string;
}

const LOCALE = 'es' as const;
const POSITIVE = '#1F7A4D';
const NEGATIVE = '#B42318';

interface Palette {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  muted: string;
  line: string;
  soft: string;
}

function palette(model: ReportRenderModel): Palette {
  const t = model.template;
  const primary = cssColor(t.useMarketColors ? model.market.primaryColor : t.colors.primary);
  const secondary = cssColor(t.useMarketColors ? model.market.secondaryColor : t.colors.secondary);
  const text = cssColor(t.colors.text);
  return {
    primary,
    secondary,
    background: cssColor(t.colors.background, '#FFFFFF'),
    text,
    muted: tint(text, 0.45),
    line: tint(text, 0.86),
    soft: tint(primary, 0.94),
  };
}

const fmt = (metric: MetricKey, value: number | null) => formatMetricValue(metric, value, LOCALE);
const int = (value: number | null | undefined) => (value === null || value === undefined ? '—' : formatMetricValue('clicks', value, LOCALE));

function sentimentClass(delta: Pick<MetricDelta, 'sentiment'>): string {
  return delta.sentiment === 'positive' ? 'pos' : delta.sentiment === 'negative' ? 'neg' : 'neutral';
}

function clickDeltaCell(change: number | null): SafeHtml {
  if (change === null) return html`<td class="num muted">—</td>`;
  const cls = change > 0 ? 'pos' : change < 0 ? 'neg' : 'neutral';
  return html`<td class="num ${cls}">${formatAbsoluteChange('clicks', change, LOCALE)}</td>`;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

function generatedDateLabel(model: ReportRenderModel): string {
  return formatDateLong(todayInTimeZone(model.timezone, model.generatedAt));
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

function baseStyles(model: ReportRenderModel, p: Palette): string {
  const t = model.template;
  const headingFont = fontStack(t.typography.headingFont);
  const bodyFont = fontStack(t.typography.bodyFont);
  const fonts = [...new Set([t.typography.headingFont, t.typography.bodyFont])].map(fontFaceCss).join('\n');
  const base = t.typography.baseFontSize;
  return `${fonts}
:root{--primary:${p.primary};--secondary:${p.secondary};--text:${p.text};--muted:${p.muted};--line:${p.line};--soft:${p.soft};--bg:${p.background};}
*{box-sizing:border-box;}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{margin:0;background:var(--bg);color:var(--text);font-family:${bodyFont};font-size:${base}pt;line-height:1.5;font-variant-numeric:tabular-nums;text-rendering:geometricPrecision;}
h1,h2,h3,h4{font-family:${headingFont};color:var(--text);margin:0;line-height:1.2;break-after:avoid;}
h1{font-size:${(base * 2.1).toFixed(1)}pt;font-weight:700;letter-spacing:-0.015em;}
h2{font-size:${(base * 1.3).toFixed(1)}pt;font-weight:650;margin:18pt 0 7pt;}
h3{font-size:${(base * 1.05).toFixed(1)}pt;font-weight:650;margin:12pt 0 5pt;}
p{margin:0 0 7pt;orphans:3;widows:3;}
ul{margin:0 0 8pt;padding-left:13pt;} li{margin:0 0 3.5pt;}
.muted{color:var(--muted);} .small{font-size:${(base * 0.82).toFixed(1)}pt;}
.pos{color:${POSITIVE};} .neg{color:${NEGATIVE};} .neutral{color:var(--muted);}
.section{break-before:page;}
.section:first-of-type{break-before:auto;}
.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12pt;padding-bottom:8pt;margin-bottom:14pt;border-bottom:1.5pt solid var(--primary);}
.section-head .num{font-family:${headingFont};font-size:${(base * 0.85).toFixed(1)}pt;font-weight:600;color:var(--primary);margin-bottom:3pt;}
.section-head .kicker{font-size:${(base * 0.82).toFixed(1)}pt;color:var(--muted);white-space:nowrap;}
.lead{font-size:${(base * 1.12).toFixed(1)}pt;line-height:1.55;}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:7pt;margin:4pt 0 12pt;}
.kpi{border:0.75pt solid var(--line);border-radius:5pt;padding:9pt 10pt 8pt;break-inside:avoid;background:#fff;}
.kpi .label{font-size:${(base * 0.82).toFixed(1)}pt;color:var(--muted);display:flex;align-items:center;gap:5pt;}
.kpi .dot{width:6pt;height:6pt;border-radius:50%;display:inline-block;}
.kpi .value{font-family:${headingFont};font-size:${(base * 1.7).toFixed(1)}pt;font-weight:700;margin:3pt 0 1pt;letter-spacing:-0.01em;}
.kpi .delta{font-size:${(base * 0.85).toFixed(1)}pt;font-weight:600;}
.kpi .prev{font-size:${(base * 0.78).toFixed(1)}pt;color:var(--muted);}
.kpi .spark{margin-top:5pt;height:26pt;}
.status-pill{display:inline-block;padding:2pt 8pt;border-radius:20pt;font-size:${(base * 0.8).toFixed(1)}pt;font-weight:600;background:var(--soft);color:var(--primary);}
.callout{background:var(--soft);border-left:2.5pt solid var(--primary);padding:10pt 12pt;border-radius:0 5pt 5pt 0;margin:0 0 12pt;break-inside:avoid;}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12pt;}
.grid-2 > *{min-width:0;}
.block{break-inside:avoid;margin-bottom:10pt;}
.chart{border:0.75pt solid var(--line);border-radius:5pt;padding:10pt;break-inside:avoid;background:#fff;margin-bottom:10pt;}
.chart-legend{display:flex;flex-wrap:wrap;gap:12pt;font-size:${(base * 0.82).toFixed(1)}pt;margin-bottom:6pt;color:var(--muted);}
.chart-legend span{display:inline-flex;align-items:center;gap:4pt;}
.chart-legend i{display:inline-block;width:12pt;height:2pt;border-radius:1pt;}
.chart-legend i.dash{background:none!important;border-top:1.5pt dashed;height:0;}
.mini-title{display:flex;justify-content:space-between;font-size:${(base * 0.85).toFixed(1)}pt;margin-bottom:2pt;}
table{width:100%;border-collapse:collapse;font-size:${(base * 0.84).toFixed(1)}pt;margin:0 0 10pt;}
thead{display:table-header-group;} tr{break-inside:avoid;}
th{text-align:left;font-weight:600;color:var(--muted);border-bottom:0.9pt solid ${tint(p.text, 0.6)};padding:4pt 5pt;white-space:nowrap;}
th.num{text-align:right;}
td{border-bottom:0.5pt solid var(--line);padding:3.6pt 5pt;vertical-align:top;}
td.num{text-align:right;white-space:nowrap;}
td.key{overflow-wrap:anywhere;word-break:break-word;}
td.rank{color:var(--muted);width:14pt;}
.bar-cell{width:34%;}
.bar{height:6pt;border-radius:3pt;background:var(--primary);}
.bar-track{background:var(--line);border-radius:3pt;}
.empty{border:0.75pt dashed var(--line);border-radius:5pt;padding:12pt;color:var(--muted);font-size:${(base * 0.9).toFixed(1)}pt;margin:0 0 10pt;break-inside:avoid;}
.empty.error{border-color:${tint(NEGATIVE, 0.6)};color:${NEGATIVE};}
.tag{display:inline-block;font-size:${(base * 0.72).toFixed(1)}pt;font-weight:600;padding:1pt 5pt;border-radius:3pt;margin-right:4pt;vertical-align:1pt;}
.tag.fact{background:${tint(POSITIVE, 0.88)};color:${POSITIVE};}
.tag.hypothesis{background:${tint('#A15C07', 0.86)};color:#8A4E06;}
.finding{padding:7pt 0;border-bottom:0.5pt solid var(--line);break-inside:avoid;}
.finding:last-child{border-bottom:none;}
.finding .refs{font-size:${(base * 0.8).toFixed(1)}pt;color:var(--muted);margin-top:2pt;overflow-wrap:anywhere;}
.reco{border:0.75pt solid var(--line);border-radius:5pt;padding:10pt 12pt;margin-bottom:8pt;break-inside:avoid;background:#fff;}
.reco-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10pt;margin-bottom:6pt;}
.reco-head h3{margin:0;}
.prio{font-size:${(base * 0.75).toFixed(1)}pt;font-weight:700;padding:2pt 7pt;border-radius:3pt;white-space:nowrap;}
.prio.critical{background:${tint(NEGATIVE, 0.85)};color:${NEGATIVE};}
.prio.high{background:${tint('#C2410C', 0.86)};color:#9A3412;}
.prio.medium{background:${tint('#A16207', 0.86)};color:#854D0E;}
.prio.low{background:${tint('#475569', 0.86)};color:#334155;}
.reco dl{display:grid;grid-template-columns:78pt 1fr;gap:3pt 10pt;margin:0;font-size:${(base * 0.92).toFixed(1)}pt;}
.reco dt{color:var(--muted);font-weight:600;} .reco dd{margin:0;}
.roadmap{display:grid;grid-template-columns:repeat(3,1fr);gap:8pt;}
.roadmap .col{border-top:2pt solid var(--primary);padding-top:6pt;break-inside:avoid;}
.roadmap .col:nth-child(2){border-top-color:${tint(p.primary, 0.35)};}
.roadmap .col:nth-child(3){border-top-color:${tint(p.primary, 0.6)};}
.device-row{display:flex;gap:16pt;align-items:center;}
.legend-list{list-style:none;padding:0;margin:0;}
.legend-list li{display:flex;align-items:center;gap:6pt;margin-bottom:4pt;}
.legend-list i{width:8pt;height:8pt;border-radius:2pt;display:inline-block;}
.note-list li{color:var(--muted);}
`;
}

function chartTheme(model: ReportRenderModel, p: Palette): ChartTheme {
  return { fontFamily: fontStack(model.template.typography.bodyFont), text: p.text, muted: p.muted, grid: p.line };
}

// ---------------------------------------------------------------------------
// Bloques reutilizables
// ---------------------------------------------------------------------------

function sectionHead(num: number, title: string, kicker: string): SafeHtml {
  return html`<div class="section-head"><div><div class="num">${String(num).padStart(2, '0')}</div><h1>${title}</h1></div><div class="kicker">${kicker}</div></div>`;
}

function emptyBlock(status: 'empty' | 'error' | 'ok', what: string, message?: string): SafeHtml {
  if (status === 'error') {
    return html`<div class="empty error">No se pudieron obtener los datos de ${what} desde Search Console${message ? `: ${message}` : '.'}</div>`;
  }
  return html`<div class="empty">Search Console no devolvió datos de ${what} para el periodo analizado.</div>`;
}

function list(items: string[]): SafeHtml {
  if (items.length === 0) return raw('');
  return html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>`;
}

function kpiCards(model: ReportRenderModel, dataset: ReportDataset, p: Palette): SafeHtml {
  const showSpark = model.template.charts.kpiSparklines;
  const cards = METRIC_KEYS.map((metric) => {
    const d = dataset.totals.deltas.find((x) => x.metric === metric)!;
    const values = dataset.timeseries.current.map((pt) => (metric === 'clicks' || metric === 'impressions' ? pt[metric] : pt[metric]));
    const spark = showSpark ? sparkline(values, METRIC_COLORS[metric], { invert: metric === 'position' }) : '';
    const hasPrev = d.previous !== null;
    return html`<div class="kpi">
      <div class="label"><span class="dot" style="background:${METRIC_COLORS[metric]}"></span>${METRIC_META[metric].longLabelEs}</div>
      <div class="value">${fmt(metric, d.current)}</div>
      ${hasPrev
        ? html`<div class="delta ${sentimentClass(d)}">${formatAbsoluteChange(metric, d.absoluteChange, LOCALE)}${metric === 'ctr' || metric === 'position' ? '' : ` · ${formatPercentChange(d.percentChange, LOCALE)}`}</div>
            <div class="prev">Anterior: ${fmt(metric, d.previous)}</div>`
        : html`<div class="prev">Sin datos de comparación</div>`}
      ${spark ? html`<div class="spark">${raw(spark)}</div>` : ''}
    </div>`;
  });
  void p;
  return html`<div class="kpis">${cards}</div>`;
}

function comparedTable(rows: ComparedRow[], opts: { keyLabel: string; max: number; label?: (key: string) => string; showShare?: boolean }): SafeHtml {
  const body = rows.slice(0, opts.max).map(
    (r, i) => html`<tr>
      <td class="rank">${i + 1}</td>
      <td class="key">${opts.label ? opts.label(r.key) : r.key}</td>
      <td class="num">${int(r.current?.clicks ?? 0)}</td>
      <td class="num">${int(r.current?.impressions ?? 0)}</td>
      <td class="num">${r.current ? formatPercent(r.current.ctr, LOCALE, 1) : '—'}</td>
      <td class="num">${r.current ? formatMetricValue('position', r.current.position, LOCALE) : '—'}</td>
      ${opts.showShare ? html`<td class="num">${r.clickShare !== null && r.clickShare !== undefined ? formatPercent(r.clickShare, LOCALE, 1) : '—'}</td>` : ''}
      ${clickDeltaCell(r.change.clicks)}
    </tr>`,
  );
  return html`<table><thead><tr><th></th><th>${opts.keyLabel}</th><th class="num">Clics</th><th class="num">Impr.</th><th class="num">CTR</th><th class="num">Pos.</th>${opts.showShare ? html`<th class="num">% clics</th>` : ''}<th class="num">Δ clics</th></tr></thead><tbody>${body}</tbody></table>`;
}

function moversTable(rows: ComparedRow[], opts: { keyLabel: string; max: number; label?: (k: string) => string }): SafeHtml {
  if (rows.length === 0) return html`<div class="empty">Sin variaciones relevantes en el periodo.</div>`;
  const body = rows.slice(0, opts.max).map(
    (r) => html`<tr>
      <td class="key">${opts.label ? opts.label(r.key) : r.key}</td>
      <td class="num">${int(r.previous?.clicks ?? 0)}</td>
      <td class="num">${int(r.current?.clicks ?? 0)}</td>
      ${clickDeltaCell(r.change.clicks)}
    </tr>`,
  );
  return html`<table><thead><tr><th>${opts.keyLabel}</th><th class="num">Antes</th><th class="num">Ahora</th><th class="num">Δ</th></tr></thead><tbody>${body}</tbody></table>`;
}

function opportunityTable(rows: OpportunityRow[], opts: { keyLabel: string; max: number; label?: (k: string) => string; showGap: boolean }): SafeHtml {
  if (rows.length === 0) return html`<div class="empty">No se identificaron elementos que cumplan este criterio.</div>`;
  const body = rows.slice(0, opts.max).map(
    (r) => html`<tr>
      <td class="key">${opts.label ? opts.label(r.key) : r.key}</td>
      <td class="num">${int(r.impressions)}</td>
      <td class="num">${int(r.clicks)}</td>
      <td class="num">${formatPercent(r.ctr, LOCALE, 1)}</td>
      <td class="num">${formatMetricValue('position', r.position, LOCALE)}</td>
      ${opts.showGap
        ? html`<td class="num">${r.benchmarkCtr !== null ? formatPercent(r.benchmarkCtr, LOCALE, 1) : '—'}</td><td class="num">${r.estimatedClickGap !== null ? `≈ ${int(r.estimatedClickGap)}` : '—'}</td>`
        : ''}
    </tr>`,
  );
  return html`<table><thead><tr><th>${opts.keyLabel}</th><th class="num">Impr.</th><th class="num">Clics</th><th class="num">CTR</th><th class="num">Pos.</th>${opts.showGap ? html`<th class="num">CTR ref.</th><th class="num">Clics pot.</th>` : ''}</tr></thead><tbody>${body}</tbody></table>`;
}

function findings(items: AiFinding[]): SafeHtml {
  if (items.length === 0) return raw('');
  return html`${items.map(
    (f) => html`<div class="finding">
      <div><span class="tag ${f.kind}">${f.kind === 'fact' ? 'Hecho' : 'Hipótesis'}</span><strong>${f.title}</strong></div>
      <div>${f.detail}</div>
      ${f.relatedQueries.length || f.relatedPages.length
        ? html`<div class="refs">${[...f.relatedQueries.map((q) => `“${q}”`), ...f.relatedPages.map(displayUrl)].join(' · ')}</div>`
        : ''}
    </div>`,
  )}`;
}

function aiUnavailableNote(model: ReportRenderModel): SafeHtml {
  if (!model.includeAi) {
    return html`<div class="empty">Este reporte se generó sin análisis de IA. Las secciones muestran únicamente datos de Search Console.</div>`;
  }
  return html`<div class="empty">El análisis de IA no está disponible para este reporte.</div>`;
}

/** Hechos derivados de forma determinista de los datos (sin IA). */
function factualHighlights(dataset: ReportDataset): string[] {
  return dataset.totals.deltas.map((d) => {
    const label = METRIC_META[d.metric].longLabelEs;
    if (d.previous === null || d.absoluteChange === null) return `${label}: ${fmt(d.metric, d.current)}.`;
    const change =
      d.metric === 'ctr' || d.metric === 'position'
        ? formatAbsoluteChange(d.metric, d.absoluteChange, LOCALE)
        : `${formatAbsoluteChange(d.metric, d.absoluteChange, LOCALE)} (${formatPercentChange(d.percentChange, LOCALE)})`;
    return `${label}: ${fmt(d.metric, d.current)} frente a ${fmt(d.metric, d.previous)} en el periodo anterior (${change}).`;
  });
}

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------

interface SectionContext {
  model: ReportRenderModel;
  dataset: ReportDataset;
  analysis: AiAnalysis | null;
  p: Palette;
  theme: ChartTheme;
  maxRows: number;
}

function executiveSummary(ctx: SectionContext, num: number): SafeHtml {
  const { dataset, analysis } = ctx;
  const es = analysis?.executiveSummary;
  return html`<section class="section">
    ${sectionHead(num, 'Resumen ejecutivo', 'Executive Summary')}
    ${es
      ? html`<div class="callout"><div style="margin-bottom:4pt"><span class="status-pill">${OVERALL_STATUS_LABELS[es.overallStatus].es}</span></div><h2 style="margin:0 0 4pt">${es.headline}</h2></div>
          <p class="lead">${es.overview}</p>`
      : ''}
    <h2>Indicadores principales</h2>
    <p class="small muted">${describeRange(dataset.period.current)} · ${comparisonLabel(dataset.period, 'es')} (${describeRange(dataset.period.previous)})</p>
    ${dataset.dataQuality.hasData ? kpiCards(ctx.model, dataset, ctx.p) : emptyBlock('empty', 'rendimiento')}
    ${es
      ? html`<div class="grid-2">
          <div class="block"><h3>Principales resultados</h3>${list(es.keyResults)}<h3>Cambios relevantes</h3>${list(es.relevantChanges)}</div>
          <div class="block"><h3>Problemas detectados</h3>${es.detectedIssues.length ? list(es.detectedIssues) : html`<p class="muted">No se detectaron problemas relevantes con los datos disponibles.</p>`}<h3>Oportunidades</h3>${list(es.opportunities)}</div>
        </div>`
      : html`<h3>Resumen de datos</h3>${list(factualHighlights(dataset))}${aiUnavailableNote(ctx.model)}`}
  </section>`;
}

function performanceOverview(ctx: SectionContext, num: number): SafeHtml {
  const { dataset, analysis, model, theme } = ctx;
  const current = dataset.timeseries.current;
  const previous = dataset.timeseries.previous;
  const dates = current.map((pt) => pt.date);
  const metrics = model.template.trendMetrics;
  const axes: Array<LineSeries['axis']> = ['left', 'right', 'none', 'none'];
  const series: LineSeries[] = metrics.map((metric, i) => ({
    key: metric,
    label: METRIC_META[metric].labelEs,
    color: METRIC_COLORS[metric],
    values: current.map((pt) => pt[metric]),
    invert: metric === 'position',
    axis: axes[i] ?? 'none',
    format: (v: number) =>
      metric === 'ctr' ? formatPercent(v, LOCALE, v < 0.1 ? 1 : 0) : metric === 'position' ? formatMetricValue('position', v, LOCALE) : formatMetricValue('clicks', v, LOCALE),
  }));
  const pa = analysis?.performanceAnalysis;
  const hasComparison = previous.length > 0 && dataset.totals.previous !== null;

  return html`<section class="section">
    ${sectionHead(num, 'Rendimiento general', 'Performance Overview')}
    ${!dataset.dataQuality.hasData
      ? emptyBlock('empty', 'rendimiento')
      : html`${model.template.charts.performanceTrend
          ? html`<div class="chart">
              <div class="chart-legend">${series.map((s) => html`<span><i style="background:${s.color}"></i>${s.label}${s.axis === 'left' ? ' (eje izq.)' : s.axis === 'right' ? ' (eje der.)' : ''}</span>`)}</div>
              ${raw(trendChart({ width: 680, height: 230, dates, series, theme }))}
              <div class="small muted">Cada métrica usa su propia escala. La posición media se representa invertida: más arriba es mejor.</div>
            </div>`
          : ''}
        ${hasComparison
          ? html`<h2>Periodo actual frente al anterior</h2>
              <div class="chart-legend"><span><i style="background:${ctx.p.text}"></i>${describeRange(dataset.period.current)}</span><span><i class="dash" style="border-color:${ctx.p.muted}"></i>${describeRange(dataset.period.previous)}</span></div>
              <div class="grid-2">${METRIC_KEYS.map((metric) => {
                const d = dataset.totals.deltas.find((x) => x.metric === metric)!;
                return html`<div class="chart" style="padding:7pt 8pt">
                  <div class="mini-title"><strong>${METRIC_META[metric].longLabelEs}</strong><span class="${sentimentClass(d)}">${fmt(metric, d.current)} · ${formatAbsoluteChange(metric, d.absoluteChange, LOCALE)}</span></div>
                  ${raw(
                    comparisonChart({
                      width: 320,
                      height: 110,
                      dates,
                      current: current.map((pt) => pt[metric]),
                      previous: previous.map((pt) => pt[metric]),
                      color: METRIC_COLORS[metric],
                      invert: metric === 'position',
                      format: (v) => (metric === 'ctr' ? formatPercent(v, LOCALE, 1) : formatMetricValue(metric === 'position' ? 'position' : 'clicks', v, LOCALE)),
                      theme,
                    }),
                  )}
                </div>`;
              })}</div>`
          : html`<div class="empty">No hay datos del periodo de comparación para mostrar la evolución frente al periodo anterior.</div>`}`}
    ${pa
      ? html`<h2>Interpretación de las métricas</h2>
          <div class="grid-2">
            <div class="block"><h3>Clics</h3><p>${pa.clicks}</p></div>
            <div class="block"><h3>Impresiones</h3><p>${pa.impressions}</p></div>
            <div class="block"><h3>CTR medio</h3><p>${pa.ctr}</p></div>
            <div class="block"><h3>Posición media</h3><p>${pa.position}</p></div>
          </div>
          <div class="callout"><strong>Síntesis.</strong> ${pa.synthesis}</div>`
      : ''}
  </section>`;
}

function dimensionSection(
  ctx: SectionContext,
  num: number,
  kind: 'query' | 'page',
): SafeHtml {
  const { dataset, analysis, maxRows, model } = ctx;
  const d: DimensionAnalysis = kind === 'query' ? dataset.queries : dataset.pages;
  const keyLabel = kind === 'query' ? 'Consulta' : 'Página';
  const label = kind === 'page' ? displayUrl : undefined;
  const ai = kind === 'query' ? analysis?.keywordAnalysis : analysis?.pageAnalysis;
  const title = kind === 'query' ? 'Rendimiento de keywords' : 'Rendimiento de páginas';
  const kicker = kind === 'query' ? 'Keyword Performance' : 'Page Performance';
  const what = kind === 'query' ? 'consultas' : 'páginas';
  const showMovers = kind === 'query' ? model.template.charts.queryMovers : model.template.charts.pageMovers;
  const hasComparison = dataset.totals.previous !== null && (d.gainers.length > 0 || d.losers.length > 0 || d.newItems.length > 0 || d.lostItems.length > 0);

  if (d.status !== 'ok') {
    return html`<section class="section">${sectionHead(num, title, kicker)}${emptyBlock(d.status, what, d.message)}</section>`;
  }
  const coverageNote =
    kind === 'query' && d.coverage.clicks !== null && d.coverage.clicks < 0.999
      ? html`<p class="small muted">Las consultas listadas suman el ${formatPercent(d.coverage.clicks, LOCALE, 0)} de los clics totales; el resto corresponde a consultas anonimizadas por Google.</p>`
      : '';

  return html`<section class="section">
    ${sectionHead(num, title, kicker)}
    ${ai ? html`<p class="lead">${ai.summary}</p>` : ''}
    <h2>${kind === 'query' ? 'Consultas principales' : 'Páginas principales'}</h2>
    ${coverageNote}
    ${comparedTable(d.top, { keyLabel, max: maxRows, label })}
    ${showMovers && hasComparison
      ? html`<div class="grid-2">
          <div class="block"><h3>En crecimiento</h3>${moversTable(d.gainers, { keyLabel, max: Math.min(8, maxRows), label })}</div>
          <div class="block"><h3>En caída</h3>${moversTable(d.losers, { keyLabel, max: Math.min(8, maxRows), label })}</div>
        </div>`
      : ''}
    ${showMovers && hasComparison && (d.newItems.length > 0 || d.lostItems.length > 0)
      ? html`<div class="grid-2">
          <div class="block"><h3>${kind === 'query' ? 'Nuevas consultas' : 'Nuevas páginas con tráfico'}</h3>${moversTable(d.newItems, { keyLabel, max: Math.min(6, maxRows), label })}</div>
          <div class="block"><h3>${kind === 'query' ? 'Consultas perdidas' : 'Páginas sin tráfico'}</h3>${moversTable(d.lostItems, { keyLabel, max: Math.min(6, maxRows), label })}</div>
        </div>`
      : ''}
    <h2>Oportunidades de optimización</h2>
    <h3>Posiciones 8–20 (cerca de la primera página)</h3>
    ${opportunityTable(d.strikingDistance, { keyLabel, max: Math.min(10, maxRows), label, showGap: false })}
    <h3>Muchas impresiones y CTR bajo</h3>
    <p class="small muted">CTR ref. = CTR medio del propio sitio en ese rango de posición. Clics pot. = estimación de clics adicionales si se alcanzara esa referencia.</p>
    ${opportunityTable(d.lowCtr, { keyLabel, max: Math.min(10, maxRows), label, showGap: true })}
    ${ai && ai.findings.length > 0 ? html`<h2>Hallazgos</h2>${findings(ai.findings)}` : ''}
  </section>`;
}

function deviceCountry(ctx: SectionContext, num: number): SafeHtml {
  const { dataset, model, p, maxRows } = ctx;
  const devices = dataset.devices;
  const countries = dataset.countries;
  const deviceColors = [p.primary, p.secondary, tint(p.primary, 0.55), tint(p.text, 0.5)];
  const totalClicks = devices.rows.reduce((s, r) => s + (r.current?.clicks ?? 0), 0);

  const observations: string[] = [];
  const topDevice = devices.rows[0];
  if (topDevice?.current && topDevice.clickShare) {
    // Misma base que la columna "% clics" (clics totales de la propiedad).
    observations.push(`${deviceLabel(topDevice.key, 'es')} concentra el ${formatPercent(topDevice.clickShare, LOCALE, 0)} de los clics.`);
  }
  const mobile = devices.rows.find((r) => r.key === 'MOBILE')?.current;
  const desktop = devices.rows.find((r) => r.key === 'DESKTOP')?.current;
  if (mobile && desktop && mobile.impressions > 0 && desktop.impressions > 0) {
    observations.push(
      `CTR en móvil ${formatPercent(mobile.ctr, LOCALE, 1)} (posición ${formatMetricValue('position', mobile.position, LOCALE)}) frente a escritorio ${formatPercent(desktop.ctr, LOCALE, 1)} (posición ${formatMetricValue('position', desktop.position, LOCALE)}).`,
    );
  }
  const topCountry = countries.rows[0];
  if (topCountry?.current && topCountry.clickShare) {
    observations.push(`${countryName(topCountry.key, 'es')} es el país principal con el ${formatPercent(topCountry.clickShare, LOCALE, 0)} de los clics.`);
  }

  const deviceBlock =
    devices.status !== 'ok'
      ? emptyBlock(devices.status, 'dispositivos', devices.message)
      : html`<div class="device-row block">
          ${model.template.charts.deviceBreakdown && totalClicks > 0
            ? html`<div>${raw(donutChart(devices.rows.map((r, i) => ({ value: r.current?.clicks ?? 0, color: deviceColors[i % deviceColors.length]! })), { size: 118, thickness: 17, track: p.line }))}</div>`
            : ''}
          <div style="flex:1">
            <table><thead><tr><th>Dispositivo</th><th class="num">Clics</th><th class="num">% clics</th><th class="num">Impr.</th><th class="num">CTR</th><th class="num">Pos.</th><th class="num">Δ clics</th></tr></thead><tbody>
            ${devices.rows.map(
              (r, i) => html`<tr>
                <td><span style="display:inline-block;width:7pt;height:7pt;border-radius:2pt;margin-right:5pt;background:${deviceColors[i % deviceColors.length]}"></span>${deviceLabel(r.key, 'es')}</td>
                <td class="num">${int(r.current?.clicks)}</td>
                <td class="num">${r.clickShare !== null && r.clickShare !== undefined ? formatPercent(r.clickShare, LOCALE, 1) : '—'}</td>
                <td class="num">${int(r.current?.impressions)}</td>
                <td class="num">${r.current ? formatPercent(r.current.ctr, LOCALE, 1) : '—'}</td>
                <td class="num">${r.current ? formatMetricValue('position', r.current.position, LOCALE) : '—'}</td>
                ${clickDeltaCell(r.change.clicks)}
              </tr>`,
            )}
            </tbody></table>
          </div>
        </div>`;

  const maxCountryClicks = Math.max(1, ...countries.rows.map((r) => r.current?.clicks ?? 0));
  const countryBlock =
    countries.status !== 'ok'
      ? emptyBlock(countries.status, 'países', countries.message)
      : html`<table><thead><tr><th>País</th>${model.template.charts.countryBreakdown ? html`<th></th>` : ''}<th class="num">Clics</th><th class="num">% clics</th><th class="num">Impr.</th><th class="num">CTR</th><th class="num">Pos.</th><th class="num">Δ clics</th></tr></thead><tbody>
          ${countries.rows.slice(0, maxRows).map(
            (r) => html`<tr>
              <td>${countryName(r.key, 'es')}</td>
              ${model.template.charts.countryBreakdown
                ? html`<td class="bar-cell"><div class="bar-track"><div class="bar" style="width:${(((r.current?.clicks ?? 0) / maxCountryClicks) * 100).toFixed(1)}%"></div></div></td>`
                : ''}
              <td class="num">${int(r.current?.clicks)}</td>
              <td class="num">${r.clickShare !== null && r.clickShare !== undefined ? formatPercent(r.clickShare, LOCALE, 1) : '—'}</td>
              <td class="num">${int(r.current?.impressions)}</td>
              <td class="num">${r.current ? formatPercent(r.current.ctr, LOCALE, 1) : '—'}</td>
              <td class="num">${r.current ? formatMetricValue('position', r.current.position, LOCALE) : '—'}</td>
              ${clickDeltaCell(r.change.clicks)}
            </tr>`,
          )}
        </tbody></table>`;

  return html`<section class="section">
    ${sectionHead(num, 'Dispositivos y países', 'Device & Country Analysis')}
    <h2>Distribución por dispositivo</h2>
    ${deviceBlock}
    <h2>Distribución geográfica</h2>
    ${countryBlock}
    ${observations.length > 0 ? html`<h2>Hallazgos relevantes</h2>${list(observations)}` : ''}
  </section>`;
}

function searchAppearanceSection(ctx: SectionContext, num: number, section: BreakdownSection): SafeHtml {
  return html`<section class="section">
    ${sectionHead(num, 'Apariencia en la búsqueda', 'Search Appearance')}
    <p class="muted">Tipos de resultado enriquecido registrados por Search Console para el sitio.</p>
    ${comparedTable(section.rows, { keyLabel: 'Tipo de resultado', max: ctx.maxRows, label: (k) => searchAppearanceLabel(k, 'es'), showShare: false })}
  </section>`;
}

function aiAnalysisSection(ctx: SectionContext, num: number): SafeHtml {
  const { analysis, dataset } = ctx;
  if (!analysis) {
    return html`<section class="section">${sectionHead(num, 'Análisis SEO con IA', 'AI SEO Analysis')}${aiUnavailableNote(ctx.model)}</section>`;
  }
  const lookup = (target: string, type: 'query' | 'page') => {
    const d = type === 'query' ? dataset.queries : dataset.pages;
    const rows = [...d.top, ...d.lowCtr.map((r) => ({ key: r.key, current: r })), ...d.strikingDistance.map((r) => ({ key: r.key, current: r }))];
    return rows.find((r) => r.key === target)?.current ?? null;
  };
  return html`<section class="section">
    ${sectionHead(num, 'Análisis SEO con IA', 'AI SEO Analysis')}
    <h2>Problemas detectados</h2>
    ${analysis.executiveSummary.detectedIssues.length
      ? list(analysis.executiveSummary.detectedIssues)
      : html`<p class="muted">No se detectaron problemas relevantes con los datos disponibles.</p>`}
    <h2>Oportunidades de CTR</h2>
    <p>${analysis.ctrOpportunities.summary}</p>
    ${analysis.ctrOpportunities.items.map((item) => {
      const m = lookup(item.target, item.targetType);
      return html`<div class="finding">
        <div><strong>${item.targetType === 'page' ? displayUrl(item.target) : `“${item.target}”`}</strong>
        ${m ? html`<span class="small muted"> — ${int(m.impressions)} impr. · CTR ${formatPercent(m.ctr, LOCALE, 1)} · pos. ${formatMetricValue('position', m.position, LOCALE)}</span>` : ''}</div>
        <div>${item.observation}</div>
        ${item.suggestedActions.length ? html`<ul style="margin-top:3pt">${item.suggestedActions.map((a) => html`<li>${a}</li>`)}</ul>` : ''}
      </div>`;
    })}
    ${analysis.opportunities.length
      ? html`<h2>Oportunidades de crecimiento</h2>${analysis.opportunities.map(
          (o) => html`<div class="finding"><strong>${o.title}</strong><div>${o.description}</div><div class="refs">Evidencia: ${o.evidence}</div></div>`,
        )}`
      : ''}
    <h2>Análisis estratégico</h2>
    <p>${analysis.performanceAnalysis.synthesis}</p>
    ${analysis.keywordAnalysis.summary ? html`<p>${analysis.keywordAnalysis.summary}</p>` : ''}
    ${analysis.pageAnalysis.summary ? html`<p>${analysis.pageAnalysis.summary}</p>` : ''}
  </section>`;
}

function actionPlan(ctx: SectionContext, num: number): SafeHtml {
  const { analysis } = ctx;
  if (!analysis) {
    return html`<section class="section">${sectionHead(num, 'Plan de acción', 'Action Plan')}${aiUnavailableNote(ctx.model)}</section>`;
  }
  const sorted = [...analysis.recommendations].sort((a, b) => PRIORITY_LEVELS.indexOf(a.priority) - PRIORITY_LEVELS.indexOf(b.priority));
  return html`<section class="section">
    ${sectionHead(num, 'Plan de acción', 'Action Plan')}
    <h2>Recomendaciones priorizadas</h2>
    ${sorted.length === 0 ? html`<div class="empty">No hay datos suficientes para formular recomendaciones concretas.</div>` : ''}
    ${sorted.map(
      (r) => html`<div class="reco">
        <div class="reco-head"><h3>${r.title}</h3><span class="prio ${r.priority}">${PRIORITY_LABELS[r.priority].es}</span></div>
        <dl>
          <dt>Problema</dt><dd>${r.problem}</dd>
          <dt>Evidencia</dt><dd>${r.evidence}</dd>
          <dt>Impacto</dt><dd>${r.potentialImpact}</dd>
          <dt>Acción</dt><dd><strong>${r.action}</strong></dd>
          <dt>Justificación</dt><dd>${r.justification}</dd>
          ${r.relatedQueries.length || r.relatedPages.length
            ? html`<dt>Referencias</dt><dd class="small muted" style="overflow-wrap:anywhere">${[...r.relatedQueries.map((q) => `“${q}”`), ...r.relatedPages.map(displayUrl)].join(' · ')}</dd>`
            : ''}
        </dl>
      </div>`,
    )}
    <h2>Hoja de ruta</h2>
    <div class="roadmap">${ROADMAP_HORIZONS.map((h) => {
      const items = analysis.conclusions.roadmap.filter((r) => r.horizon === h);
      return html`<div class="col"><h3 style="margin-top:0">${ROADMAP_HORIZON_LABELS[h].es}</h3>${items.length ? list(items.map((i) => i.action)) : html`<p class="muted small">Sin acciones en este horizonte.</p>`}</div>`;
    })}</div>
    <h2>Conclusión</h2>
    <p class="lead">${analysis.conclusions.summary}</p>
  </section>`;
}

function dataNotes(ctx: SectionContext, num: number): SafeHtml {
  const { dataset, analysis, model } = ctx;
  const meta = model.aiMeta;
  const notes = [
    ...dataset.period.notes.map((n) => formatPeriodNote(n, 'es')),
    ...dataset.dataQuality.issues.map((i) => formatDataIssue(i, 'es')),
  ];
  return html`<section class="section">
    ${sectionHead(num, 'Notas sobre los datos', 'Methodology & Data Notes')}
    <h2>Fuente y metodología</h2>
    <ul>
      <li>Fuente: Google Search Console (búsqueda web), propiedad <strong>${dataset.property.siteUrl}</strong> (${dataset.property.propertyType === 'DOMAIN' ? 'propiedad de dominio' : 'propiedad de prefijo de URL'}).</li>
      <li>Periodo analizado: ${describeRange(dataset.period.current)} (${dataset.period.days} días). Comparación: ${describeRange(dataset.period.previous)} (${dataset.period.previousDays} días).</li>
      <li>Solo se usan datos finales. Último día con datos consolidados: ${formatDateLong(dataset.freshness.latestAvailableDate)}${dataset.freshness.source === 'estimated' ? ' (estimado según el retraso habitual de Search Console)' : ''}.</li>
      <li>CTR = clics / impresiones. La posición media es la posición más alta promedio del sitio en los resultados; un valor menor es mejor.</li>
      <li>Las fechas de Search Console se registran en horario del Pacífico (PT).</li>
    </ul>
    ${notes.length ? html`<h2>Consideraciones de este periodo</h2><ul class="note-list">${notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}
    ${analysis
      ? html`<h2>Análisis con IA</h2>
          <p class="muted">El análisis cualitativo se generó con ${meta?.servedBy ?? model.aiMeta?.model ?? 'Claude (Anthropic)'} a partir exclusivamente de los datos de este reporte. Los hechos se distinguen de las hipótesis; las hipótesis deben validarse revisando las páginas y su contexto.</p>
          ${analysis.dataLimitations.length ? html`<h3>Limitaciones señaladas</h3>${list(analysis.dataLimitations)}` : ''}`
      : ''}
  </section>`;
}

// ---------------------------------------------------------------------------
// Portada, encabezado y pie
// ---------------------------------------------------------------------------

function brandMark(model: ReportRenderModel, opts: { height: number; color: string }): SafeHtml {
  if (model.branding.logoDataUri) {
    return html`<img src="${model.branding.logoDataUri}" alt="${model.branding.companyName}" style="height:${opts.height}px;width:auto;display:block" />`;
  }
  return html`<span style="font-weight:700;letter-spacing:-0.01em;color:${opts.color};font-size:${Math.round(opts.height * 0.9)}px">${model.branding.companyName}</span>`;
}

function marketMark(model: ReportRenderModel, size: number, p: Palette): SafeHtml {
  if (model.market.logoDataUri) {
    return html`<img src="${model.market.logoDataUri}" alt="${model.market.name}" style="max-height:${size}px;max-width:${size * 3}px;width:auto;height:auto;display:block" />`;
  }
  const initials = model.market.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return html`<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size / 5)}px;background:${p.primary};color:${readableTextOn(p.primary)};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.38)}px">${initials}</div>`;
}

function coverMeta(model: ReportRenderModel, color: string, muted: string): SafeHtml {
  const d = model.dataset;
  const rows: Array<[string, string]> = d
    ? [
        ['Periodo analizado', `${describeRange(d.period.current)}`],
        ['Comparado con', `${describeRange(d.period.previous)}`],
        ['Preset', PERIOD_PRESET_LABELS_ES[d.period.preset]],
        ['Fecha de generación', generatedDateLabel(model)],
      ]
    : [
        ['Periodo analizado', 'Se completa al generar el reporte'],
        ['Fecha de generación', generatedDateLabel(model)],
      ];
  return html`<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:14px 24px">${rows.map(
    ([k, v]) => html`<div><div style="font-size:9.5px;color:${muted};margin-bottom:3px">${k}</div><div style="font-size:12.5px;font-weight:600;color:${color};white-space:nowrap">${v}</div></div>`,
  )}</div>`;
}

function coverHtml(model: ReportRenderModel, p: Palette): SafeHtml {
  const t = model.template;
  const title = t.cover.title;
  const subtitle = t.cover.subtitle;
  const style = t.cover.style;
  const headingFont = fontStack(t.typography.headingFont);
  const onPrimary = readableTextOn(p.primary);

  if (style === 'band') {
    return html`<div class="cover" style="height:297mm;display:flex;flex-direction:column;background:${p.background}">
      <div style="background:${p.primary};color:${onPrimary};padding:22mm 20mm 18mm;height:150mm;display:flex;flex-direction:column;justify-content:space-between">
        <div style="display:flex;justify-content:space-between;align-items:center">${brandMark(model, { height: 26, color: onPrimary })}<span style="font-size:11px;opacity:.85">${model.market.domain}</span></div>
        <div>
          <div style="font-size:13px;opacity:.85;margin-bottom:10px">${model.market.name}</div>
          <div style="font-family:${raw(headingFont)};font-size:40px;font-weight:700;line-height:1.08;letter-spacing:-0.02em;max-width:150mm">${title}</div>
          ${subtitle ? html`<div style="font-size:14px;margin-top:12px;opacity:.9;max-width:140mm">${subtitle}</div>` : ''}
        </div>
      </div>
      <div style="flex:1;padding:16mm 20mm;display:flex;flex-direction:column;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:16px">${marketMark(model, 64, p)}<div><div style="font-family:${raw(headingFont)};font-size:20px;font-weight:700">${model.market.name}</div><div style="color:${p.muted}">${model.market.domain}</div></div></div>
        ${coverMeta(model, p.text, p.muted)}
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid ${p.line};padding-top:10px;font-size:10px;color:${p.muted}"><span>Preparado por ${model.branding.companyName}</span>${brandMark(model, { height: 16, color: p.text })}</div>
      </div>
    </div>`;
  }

  if (style === 'minimal') {
    return html`<div class="cover" style="height:297mm;padding:26mm 24mm;display:flex;flex-direction:column;justify-content:space-between;background:${p.background};text-align:center">
      <div style="display:flex;justify-content:center">${brandMark(model, { height: 24, color: p.text })}</div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:18px">
        ${marketMark(model, 72, p)}
        <div style="width:40px;height:2px;background:${p.primary}"></div>
        <div style="font-family:${raw(headingFont)};font-size:36px;font-weight:700;letter-spacing:-0.02em;line-height:1.1">${title}</div>
        ${subtitle ? html`<div style="font-size:13px;color:${p.muted};max-width:130mm">${subtitle}</div>` : ''}
        <div style="font-size:16px;font-weight:600">${model.market.name} <span style="color:${p.muted};font-weight:400">— ${model.market.domain}</span></div>
      </div>
      <div style="text-align:left">${coverMeta(model, p.text, p.muted)}</div>
    </div>`;
  }

  // editorial (predeterminado)
  return html`<div class="cover" style="height:297mm;display:grid;grid-template-columns:9mm 1fr;background:${p.background}">
    <div style="background:linear-gradient(${p.primary},${p.primary}) top/100% 62% no-repeat, linear-gradient(${p.secondary},${p.secondary}) bottom/100% 38% no-repeat"></div>
    <div style="padding:20mm 20mm 18mm 16mm;display:flex;flex-direction:column;justify-content:space-between">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">${brandMark(model, { height: 26, color: p.text })}<div style="text-align:right;font-size:10px;color:${p.muted}">SEO Report<br/>${generatedDateLabel(model)}</div></div>
      <div>
        <div style="margin-bottom:22px">${marketMark(model, 76, p)}</div>
        <div style="font-size:13px;color:${p.primary};font-weight:600;margin-bottom:8px">${model.market.name} · ${model.market.domain}</div>
        <div style="font-family:${raw(headingFont)};font-size:44px;font-weight:700;line-height:1.05;letter-spacing:-0.025em;max-width:150mm">${title}</div>
        ${subtitle ? html`<div style="font-size:14px;color:${p.muted};margin-top:14px;max-width:135mm;line-height:1.5">${subtitle}</div>` : ''}
      </div>
      <div>
        <div style="border-top:1.5px solid ${p.text};padding-top:12px;margin-bottom:22px">${coverMeta(model, p.text, p.muted)}</div>
        <div style="font-size:9.5px;color:${p.muted}">Preparado por ${model.branding.companyName} con datos de Google Search Console.</div>
      </div>
    </div>
  </div>`;
}

function headerTemplate(model: ReportRenderModel, p: Palette): string {
  const h = model.template.header;
  if (!h.enabled) return '<div></div>';
  const logo =
    h.showMarketLogo && model.market.logoDataUri
      ? `<img src="${escapeHtml(model.market.logoDataUri)}" style="height:13px;width:auto;margin-right:7px"/>`
      : '';
  const period = model.dataset ? escapeHtml(describeRange(model.dataset.period.current)) : '';
  return `<div style="width:100%;padding:0 16mm;font-family:Helvetica,Arial,sans-serif;font-size:7.5px;color:${p.muted};display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;">
<div style="display:flex;align-items:center">${logo}<span style="color:${p.text};font-weight:600">${escapeHtml(model.market.name)}</span>${h.text ? `<span style="margin:0 6px">|</span><span>${escapeHtml(h.text)}</span>` : ''}</div>
<div>${period}</div></div>`;
}

function footerTemplate(model: ReportRenderModel, p: Palette): string {
  const f = model.template.footer;
  // El branding de Codario Labs aparece siempre, aunque el pie esté desactivado en la plantilla.
  const brand = model.branding.logoDataUri
    ? `<img src="${escapeHtml(model.branding.logoDataUri)}" style="height:10px;width:auto;margin-right:7px"/>`
    : `<span style="font-weight:700;color:${p.text};margin-right:7px">${escapeHtml(model.branding.companyName)}</span>`;
  const text = f.enabled && f.text ? `<span>${escapeHtml(f.text)}</span>` : '';
  const date = f.enabled && f.showGeneratedDate ? `Generado el ${escapeHtml(generatedDateLabel(model))}` : '';
  const pages = f.enabled && f.showPageNumbers ? `Página <span class="pageNumber"></span> de <span class="totalPages"></span>` : '';
  // Rejilla 1fr | auto | 1fr: la columna central queda centrada en la página
  // aunque los bloques laterales tengan anchos distintos.
  return `<div style="width:100%;box-sizing:border-box;padding:0 16mm;font-family:Helvetica,Arial,sans-serif;font-size:7px;color:${p.muted};display:grid;grid-template-columns:1fr auto 1fr;align-items:center;column-gap:12px;-webkit-print-color-adjust:exact;">
<div style="display:flex;align-items:center;justify-self:start;min-width:0">${brand}${text}</div>
<div style="justify-self:center;text-align:center;white-space:nowrap">${date}</div>
<div style="justify-self:end;text-align:right;white-space:nowrap">${pages}</div></div>`;
}

// ---------------------------------------------------------------------------
// Ensamblado
// ---------------------------------------------------------------------------

function documentShell(model: ReportRenderModel, p: Palette, body: SafeHtml, extraCss = ''): string {
  const title = `${model.template.cover.title} — ${model.market.name}`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title><style>${baseStyles(model, p)}${extraCss}</style></head><body>${body.value}</body></html>`;
}

export function buildBodySections(model: ReportRenderModel, p: Palette): SafeHtml {
  const dataset = model.dataset;
  if (!dataset) return raw('');
  const t = model.template;
  const ctx: SectionContext = {
    model,
    dataset,
    analysis: model.analysis,
    p,
    theme: chartTheme(model, p),
    maxRows: t.tables.maxRows,
  };
  const sections: SafeHtml[] = [];
  let n = 1;
  const add = (enabled: boolean, build: (num: number) => SafeHtml) => {
    if (!enabled) return;
    n += 1;
    sections.push(build(n));
  };
  add(t.sections.executiveSummary, (num) => executiveSummary(ctx, num));
  add(t.sections.performanceOverview, (num) => performanceOverview(ctx, num));
  add(t.sections.keywordPerformance, (num) => dimensionSection(ctx, num, 'query'));
  add(t.sections.pagePerformance, (num) => dimensionSection(ctx, num, 'page'));
  add(t.sections.deviceCountry, (num) => deviceCountry(ctx, num));
  // La apariencia en búsqueda solo se incluye si GSC devolvió datos (no se rellena una sección vacía).
  add(t.sections.searchAppearance && dataset.searchAppearance.status === 'ok', (num) =>
    searchAppearanceSection(ctx, num, dataset.searchAppearance),
  );
  add(t.sections.aiAnalysis && (model.includeAi || model.analysis !== null), (num) => aiAnalysisSection(ctx, num));
  add(t.sections.actionPlan && (model.includeAi || model.analysis !== null), (num) => actionPlan(ctx, num));
  add(t.sections.dataNotes, (num) => dataNotes(ctx, num));
  if (sections.length === 0) {
    sections.push(html`<section class="section">${sectionHead(2, 'Resumen de datos', 'Summary')}${list(factualHighlights(dataset))}</section>`);
  }
  return join(sections);
}

/** Genera el HTML de portada, cuerpo y plantillas de encabezado/pie para el PDF. */
export function renderReport(model: ReportRenderModel): RenderedReport {
  const p = palette(model);
  const cover = documentShell(model, p, coverHtml(model, p), '@page{size:A4;margin:0;} body{margin:0;}');
  const body = documentShell(model, p, buildBodySections(model, p));
  return {
    coverHtml: cover,
    bodyHtml: body,
    headerTemplate: headerTemplate(model, p),
    footerTemplate: footerTemplate(model, p),
    margins: { top: '22mm', bottom: '18mm', left: '16mm', right: '16mm' },
    title: `${model.template.cover.title} — ${model.market.name}`,
  };
}

/** Bloques de marcador (sin cifras) para previsualizar una plantilla sin datos reales. */
function skeletonBody(p: Palette): SafeHtml {
  const bar = (w: string, h = 8) => html`<div style="height:${h}pt;width:${w};background:${p.line};border-radius:3pt;margin:5pt 0"></div>`;
  return html`<section class="section">
    ${sectionHead(2, 'Resumen ejecutivo', 'Executive Summary')}
    <div class="callout">${bar('70%', 12)}${bar('45%')}</div>
    <div class="kpis">${METRIC_KEYS.map(
      (m) => html`<div class="kpi"><div class="label"><span class="dot" style="background:${METRIC_COLORS[m]}"></span>${METRIC_META[m].longLabelEs}</div>${bar('60%', 16)}${bar('40%')}</div>`,
    )}</div>
    <div class="chart" style="height:150pt;display:flex;align-items:center;justify-content:center;color:${p.muted}">Gráfico temporal (datos reales de Search Console)</div>
    <table><thead><tr><th>Consulta</th><th class="num">Clics</th><th class="num">Impr.</th><th class="num">CTR</th><th class="num">Pos.</th></tr></thead><tbody>
      ${[1, 2, 3, 4, 5].map(() => html`<tr><td>${bar('80%')}</td><td>${bar('70%')}</td><td>${bar('70%')}</td><td>${bar('60%')}</td><td>${bar('50%')}</td></tr>`)}
    </tbody></table>
    <p class="small muted">Vista previa de estilo. Las cifras se completan con datos reales de Google Search Console al generar el reporte.</p>
  </section>`;
}

/**
 * Vista previa HTML (para un iframe con sandbox): simula las hojas A4, encabezado y pie.
 * Si no hay dataset real, muestra marcadores sin cifras.
 */
export function renderPreview(model: ReportRenderModel): string {
  const p = palette(model);
  const body = model.dataset ? buildBodySections(model, p) : skeletonBody(p);
  const sheetCss = `
body{background:#E9EBEF;padding:24px 0;}
.sheet{width:210mm;min-height:297mm;margin:0 auto 24px;background:var(--bg);box-shadow:0 1px 3px rgba(15,23,42,.12),0 8px 24px rgba(15,23,42,.08);position:relative;overflow:hidden;}
.sheet.body-sheet{padding:22mm 16mm 18mm;}
.pv-header,.pv-footer{position:absolute;left:0;right:0;}
.pv-header{top:8mm;} .pv-footer{bottom:7mm;}
.section{break-before:auto;margin-bottom:28pt;}
`;
  const shell = html`
    <div class="sheet">${coverHtml(model, p)}</div>
    <div class="sheet body-sheet">
      <div class="pv-header">${raw(headerTemplate(model, p).replace('<span class="pageNumber"></span>', '2'))}</div>
      ${body}
      <div class="pv-footer">${raw(footerTemplate(model, p).replace('<span class="pageNumber"></span>', '1').replace('<span class="totalPages"></span>', '8'))}</div>
    </div>`;
  return documentShell(model, p, shell, sheetCss);
}
