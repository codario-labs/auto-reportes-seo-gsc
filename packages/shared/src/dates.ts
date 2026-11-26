/**
 * Utilidades de fechas de calendario (YYYY-MM-DD) sin zona horaria.
 *
 * Google Search Console trabaja con días de calendario (en horario del Pacífico).
 * Para evitar desfases por zonas horarias, toda la aritmética se realiza en UTC
 * sobre fechas "planas" representadas como cadenas ISO.
 */

export type IsoDate = string;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function parseIsoDate(value: IsoDate): Date {
  if (!ISO_DATE_RE.test(value)) {
    throw new RangeError(`Fecha inválida: "${value}" (formato esperado YYYY-MM-DD)`);
  }
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  return formatIsoDate(parseIsoDate(value)) === value;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return formatIsoDate(new Date(parseIsoDate(date).getTime() + days * DAY_MS));
}

/** Suma meses respetando el fin de mes (31 ene + 1 mes = 28/29 feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parseIsoDate(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatIsoDate(new Date(Date.UTC(year, month, Math.min(day, lastDayOfTarget))));
}

/** Número de días desde `from` hasta `to` (to - from). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS);
}

/** Días del rango, ambos extremos incluidos. */
export function daysInRange(start: IsoDate, end: IsoDate): number {
  return diffDays(start, end) + 1;
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: IsoDate): IsoDate {
  const d = parseIsoDate(date);
  return formatIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Lunes de la semana ISO que contiene la fecha. */
export function startOfIsoWeek(date: IsoDate): IsoDate {
  const weekday = parseIsoDate(date).getUTCDay(); // 0 = domingo
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, offset);
}

export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minIsoDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxIsoDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

export function enumerateDates(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  const total = daysInRange(start, end);
  for (let i = 0; i < total; i += 1) out.push(addDays(start, i));
  return out;
}

/** Fecha de "hoy" en una zona horaria IANA (p. ej. America/Bogota). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const SHORT_MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const LONG_MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "3 nov 2026" */
export function formatDateShort(date: IsoDate): string {
  const d = parseIsoDate(date);
  return `${d.getUTCDate()} ${SHORT_MONTHS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "3 de noviembre de 2026" */
export function formatDateLong(date: IsoDate): string {
  const d = parseIsoDate(date);
  return `${d.getUTCDate()} de ${LONG_MONTHS_ES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** "3 nov" (sin año), útil para ejes de gráficos. */
export function formatDayMonth(date: IsoDate): string {
  const d = parseIsoDate(date);
  return `${d.getUTCDate()} ${SHORT_MONTHS_ES[d.getUTCMonth()]}`;
}

/** "1–28 nov 2026", "28 oct – 3 nov 2026" o "15 dic 2025 – 3 ene 2026". */
export function formatDateRange(start: IsoDate, end: IsoDate): string {
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  if (start === end) return formatDateShort(start);
  if (sameMonth) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${SHORT_MONTHS_ES[e.getUTCMonth()]} ${e.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${formatDayMonth(start)} – ${formatDateShort(end)}`;
  }
  return `${formatDateShort(start)} – ${formatDateShort(end)}`;
}
