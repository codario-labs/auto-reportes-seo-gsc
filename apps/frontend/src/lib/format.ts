import { parseIsoDate, type IsoDate } from '@codario/shared';

const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Nov 3" (fecha de calendario, sin desfase de zona horaria). */
export function displayDay(date: IsoDate): string {
  return dayFmt.format(parseIsoDate(date));
}

/** "Nov 3, 2026" */
export function displayDate(date: IsoDate): string {
  return dateFmt.format(parseIsoDate(date));
}

/** "Nov 1–24, 2026", "Oct 28 – Nov 24, 2026" o "Dec 15, 2025 – Jan 3, 2026". */
export function displayRange(start: IsoDate, end: IsoDate): string {
  if (start === end) return displayDate(start);
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  if (sameYear && s.getUTCMonth() === e.getUTCMonth()) {
    return `${displayDay(start)}–${e.getUTCDate()}, ${e.getUTCFullYear()}`;
  }
  if (sameYear) return `${displayDay(start)} – ${displayDate(end)}`;
  return `${displayDate(start)} – ${displayDate(end)}`;
}

/** Fecha-hora ISO en la zona local del navegador. */
export function displayDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d);
}

const relativeFmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function displayRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const seconds = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relativeFmt.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relativeFmt.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86_400 * 30) return relativeFmt.format(Math.round(seconds / 86_400), 'day');
  return displayDateTime(iso);
}

/** Duración en ms → "850 ms", "4.2 s", "1 min 04 s". */
export function displayDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
}

/** Cronómetro "0:42" / "1:05:09". */
export function displayElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function displayBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function displayNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

/** Muestra una URL de página sin protocolo para tablas compactas. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
