/**
 * Plantillas HTML seguras: toda interpolación se escapa salvo que se marque explícitamente como HTML confiable.
 * El contenido generado por la IA y los datos de GSC (consultas, URLs) nunca se insertan sin escapar.
 */

const RAW = Symbol('raw-html');

export interface SafeHtml {
  readonly [RAW]: true;
  readonly value: string;
}

export function raw(value: string): SafeHtml {
  return { [RAW]: true, value };
}

function isSafe(value: unknown): value is SafeHtml {
  return typeof value === 'object' && value !== null && (value as Partial<SafeHtml>)[RAW] === true;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type Interpolation = SafeHtml | string | number | null | undefined | false | Interpolation[];

function render(value: Interpolation): string {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (isSafe(value)) return value.value;
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Interpolation[]): SafeHtml {
  let out = strings[0] ?? '';
  values.forEach((value, i) => {
    out += render(value) + (strings[i + 1] ?? '');
  });
  return raw(out);
}

export function join(items: SafeHtml[], separator = ''): SafeHtml {
  return raw(items.map((i) => i.value).join(separator));
}

/** Valida un color hex antes de insertarlo en CSS. */
export function cssColor(value: string, fallback = '#111827'): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

/** Mezcla un color hex con blanco (amount 0..1 = proporción de blanco). */
export function tint(hex: string, amount: number): string {
  const c = cssColor(hex).slice(1);
  const n = parseInt(c, 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

/** Luminancia relativa (WCAG) para elegir texto claro u oscuro sobre un color. */
export function relativeLuminance(hex: string): number {
  const n = parseInt(cssColor(hex).slice(1), 16);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function readableTextOn(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? '#111827' : '#FFFFFF';
}
