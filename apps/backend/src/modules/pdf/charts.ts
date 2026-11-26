import { formatDayMonth, type IsoDate } from '@codario/shared';
import { cssColor, escapeHtml } from './html';

/**
 * Gráficos SVG vectoriales generados en el servidor a partir de datos reales.
 * Se renderizan sin JavaScript (el PDF se imprime con JS desactivado) y escalan sin pérdida.
 */

export interface ChartTheme {
  fontFamily: string;
  text: string;
  muted: string;
  grid: string;
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  values: Array<number | null>;
  /** Para posición media: valores menores se dibujan más arriba. */
  invert?: boolean;
  dashed?: boolean;
  opacity?: number;
  axis?: 'left' | 'right' | 'none';
  format: (value: number) => string;
}

interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

function niceStep(range: number, ticks: number): number {
  const raw = range / Math.max(1, ticks);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function niceScale(values: Array<number | null>, options: { zeroBased: boolean; ticks?: number }): Scale {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const tickCount = options.ticks ?? 4;
  if (nums.length === 0) return { min: 0, max: 1, ticks: [0, 1] };
  let min = options.zeroBased ? 0 : Math.min(...nums);
  let max = Math.max(...nums);
  if (max === min) {
    max = max === 0 ? 1 : max * 1.1;
    if (!options.zeroBased) min = Math.max(0, min * 0.9);
  }
  const step = niceStep(max - min, tickCount);
  const niceMin = options.zeroBased ? 0 : Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return { min: niceMin, max: niceMax, ticks };
}

function project(value: number, scale: Scale, height: number, invert: boolean): number {
  const t = (value - scale.min) / (scale.max - scale.min || 1);
  return invert ? t * height : height - t * height;
}

function linePath(values: Array<number | null>, xs: number[], scale: Scale, height: number, invert: boolean, top: number): string {
  let d = '';
  let drawing = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      drawing = false;
      return;
    }
    const x = xs[i]!;
    const y = top + project(v, scale, height, invert);
    d += `${drawing ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `;
    drawing = true;
  });
  return d.trim();
}

function isolatedPoints(values: Array<number | null>, xs: number[], scale: Scale, height: number, invert: boolean, top: number) {
  // Puntos sin vecinos válidos: se dibujan como círculos para que no desaparezcan.
  return values.flatMap((v, i) => {
    if (v === null) return [];
    const prev = values[i - 1];
    const next = values[i + 1];
    if ((prev === null || prev === undefined) && (next === null || next === undefined)) {
      return [{ x: xs[i]!, y: top + project(v, scale, height, invert) }];
    }
    return [];
  });
}

function xPositions(count: number, left: number, width: number): number[] {
  if (count <= 1) return [left + width / 2];
  return Array.from({ length: count }, (_, i) => left + (i * width) / (count - 1));
}

function dateTickIndexes(count: number, maxLabels: number): number[] {
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (maxLabels - 1);
  return Array.from({ length: maxLabels }, (_, i) => Math.round(i * step));
}

/** Gráfico temporal multi-métrica (cada métrica con su propia escala, como en GSC). */
export function trendChart(opts: {
  width: number;
  height: number;
  dates: IsoDate[];
  series: LineSeries[];
  theme: ChartTheme;
}): string {
  const { width, height, dates, series, theme } = opts;
  const hasLeft = series.some((s) => s.axis === 'left');
  const hasRight = series.some((s) => s.axis === 'right');
  const pad = { top: 14, right: hasRight ? 52 : 14, bottom: 26, left: hasLeft ? 52 : 14 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xs = xPositions(dates.length, pad.left, plotW);
  const font = `font-family="${escapeHtml(theme.fontFamily)}"`;

  const scales = series.map((s) => niceScale(s.values, { zeroBased: !s.invert, ticks: 4 }));
  const gridSource = scales[series.findIndex((s) => s.axis === 'left')] ?? scales[0] ?? { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  const gridInvert = series.find((s) => s.axis === 'left')?.invert ?? false;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Evolución temporal de métricas">`);
  for (const tick of gridSource.ticks) {
    const y = pad.top + project(tick, gridSource, plotH, gridInvert);
    parts.push(`<line x1="${pad.left}" x2="${width - pad.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${theme.grid}" stroke-width="0.6"/>`);
  }
  series.forEach((s, i) => {
    if (s.axis !== 'left' && s.axis !== 'right') return;
    const scale = scales[i]!;
    const x = s.axis === 'left' ? pad.left - 8 : width - pad.right + 8;
    const anchor = s.axis === 'left' ? 'end' : 'start';
    for (const tick of scale.ticks) {
      const y = pad.top + project(tick, scale, plotH, Boolean(s.invert));
      parts.push(`<text x="${x}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}" font-size="8" fill="${cssColor(s.color)}" ${font}>${escapeHtml(s.format(tick))}</text>`);
    }
  });
  for (const idx of dateTickIndexes(dates.length, 7)) {
    const date = dates[idx];
    if (!date) continue;
    parts.push(`<text x="${xs[idx]!.toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="8" fill="${theme.muted}" ${font}>${escapeHtml(formatDayMonth(date))}</text>`);
  }
  series.forEach((s, i) => {
    const scale = scales[i]!;
    const d = linePath(s.values, xs, scale, plotH, Boolean(s.invert), pad.top);
    const color = cssColor(s.color);
    if (d) {
      parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"${s.dashed ? ' stroke-dasharray="4 3"' : ''}${s.opacity ? ` stroke-opacity="${s.opacity}"` : ''}/>`);
    }
    for (const p of isolatedPoints(s.values, xs, scale, plotH, Boolean(s.invert), pad.top)) {
      parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.2" fill="${color}"/>`);
    }
  });
  parts.push(`<line x1="${pad.left}" x2="${width - pad.right}" y1="${pad.top + plotH}" y2="${pad.top + plotH}" stroke="${theme.grid}" stroke-width="0.8"/>`);
  parts.push('</svg>');
  return parts.join('');
}

/** Mini gráfico de comparación: periodo actual (sólido) vs anterior (discontinuo), alineados por día. */
export function comparisonChart(opts: {
  width: number;
  height: number;
  dates: IsoDate[];
  current: Array<number | null>;
  previous: Array<number | null>;
  color: string;
  invert?: boolean;
  format: (value: number) => string;
  theme: ChartTheme;
}): string {
  const { width, height, dates, theme } = opts;
  const pad = { top: 8, right: 8, bottom: 18, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const count = Math.max(opts.current.length, opts.previous.length);
  const xs = xPositions(count, pad.left, plotW);
  const scale = niceScale([...opts.current, ...opts.previous], { zeroBased: !opts.invert, ticks: 3 });
  const color = cssColor(opts.color);
  const font = `font-family="${escapeHtml(theme.fontFamily)}"`;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%">`];
  for (const tick of scale.ticks) {
    const y = pad.top + project(tick, scale, plotH, Boolean(opts.invert));
    parts.push(`<line x1="${pad.left}" x2="${width - pad.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${theme.grid}" stroke-width="0.5"/>`);
    parts.push(`<text x="${pad.left - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="7" fill="${theme.muted}" ${font}>${escapeHtml(opts.format(tick))}</text>`);
  }
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first) parts.push(`<text x="${pad.left}" y="${height - 5}" font-size="7" fill="${theme.muted}" ${font}>${escapeHtml(formatDayMonth(first))}</text>`);
  if (last && dates.length > 1) parts.push(`<text x="${width - pad.right}" y="${height - 5}" text-anchor="end" font-size="7" fill="${theme.muted}" ${font}>${escapeHtml(formatDayMonth(last))}</text>`);
  const prevPath = linePath(opts.previous, xs, scale, plotH, Boolean(opts.invert), pad.top);
  if (prevPath) parts.push(`<path d="${prevPath}" fill="none" stroke="${color}" stroke-opacity="0.4" stroke-width="1.2" stroke-dasharray="3 2.5"/>`);
  const curPath = linePath(opts.current, xs, scale, plotH, Boolean(opts.invert), pad.top);
  if (curPath) parts.push(`<path d="${curPath}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const p of isolatedPoints(opts.current, xs, scale, plotH, Boolean(opts.invert), pad.top)) {
    parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2" fill="${color}"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

/** Sparkline sin ejes para tarjetas KPI. */
export function sparkline(values: Array<number | null>, color: string, opts: { width?: number; height?: number; invert?: boolean } = {}): string {
  const width = opts.width ?? 120;
  const height = opts.height ?? 30;
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return '';
  const scale = niceScale(values, { zeroBased: false, ticks: 2 });
  const xs = xPositions(values.length, 1, width - 2);
  const d = linePath(values, xs, { ...scale, min: Math.min(...nums), max: Math.max(...nums) === Math.min(...nums) ? Math.min(...nums) + 1 : Math.max(...nums) }, height - 4, Boolean(opts.invert), 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${cssColor(color)}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/** Gráfico de anillo para distribuciones (p. ej. clics por dispositivo). */
export function donutChart(segments: Array<{ value: number; color: string }>, opts: { size?: number; thickness?: number; track: string }): string {
  const size = opts.size ?? 120;
  const thickness = opts.thickness ?? 16;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value), 0);
  const circumference = 2 * Math.PI * r;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`];
  parts.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${cssColor(opts.track, '#E5E7EB')}" stroke-width="${thickness}"/>`);
  if (total > 0) {
    let offset = 0;
    for (const seg of segments) {
      const length = (Math.max(0, seg.value) / total) * circumference;
      if (length <= 0) continue;
      parts.push(
        `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${cssColor(seg.color)}" stroke-width="${thickness}" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`,
      );
      offset += length;
    }
  }
  parts.push('</svg>');
  return parts.join('');
}
