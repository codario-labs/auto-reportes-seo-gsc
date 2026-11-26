import { FONT_OPTIONS, type FontKey } from '@codario/shared';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const WEIGHTS = [400, 500, 600, 700] as const;
const cache = new Map<FontKey, string>();

function fontDir(font: FontKey): string {
  // Los paquetes @fontsource restringen "exports"; se resuelve su CSS principal y se toma la carpeta.
  return path.dirname(require.resolve(`@fontsource/${font}`));
}

/** CSS @font-face con las fuentes incrustadas en base64 (el PDF se renderiza sin acceso a red). */
export function fontFaceCss(font: FontKey): string {
  const cached = cache.get(font);
  if (cached) return cached;
  const dir = fontDir(font);
  const family = FONT_OPTIONS[font].family;
  const css = WEIGHTS.map((weight) => {
    const file = path.join(dir, 'files', `${font}-latin-${weight}-normal.woff2`);
    const data = readFileSync(file).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2');}`;
  }).join('\n');
  cache.set(font, css);
  return css;
}

export function fontStack(font: FontKey): string {
  const option = FONT_OPTIONS[font];
  const fallback = option.category === 'serif' ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Arial, sans-serif";
  return `'${option.family}', ${fallback}`;
}
