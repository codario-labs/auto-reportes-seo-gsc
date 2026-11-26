import {
  addDays,
  addMonths,
  daysInRange,
  endOfMonth,
  formatDateRange,
  isIsoDate,
  minIsoDate,
  startOfIsoWeek,
  startOfMonth,
  type IsoDate,
} from './dates';

export const PERIOD_PRESETS = [
  'LAST_7_DAYS',
  'LAST_14_DAYS',
  'LAST_28_DAYS',
  'LAST_30_DAYS',
  'LAST_3_MONTHS',
  'LAST_6_MONTHS',
  'LAST_12_MONTHS',
  'PREVIOUS_WEEK',
  'PREVIOUS_MONTH',
  'CURRENT_MONTH',
  'CUSTOM',
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  LAST_7_DAYS: 'Last 7 days',
  LAST_14_DAYS: 'Last 14 days',
  LAST_28_DAYS: 'Last 28 days',
  LAST_30_DAYS: 'Last 30 days',
  LAST_3_MONTHS: 'Last 3 months',
  LAST_6_MONTHS: 'Last 6 months',
  LAST_12_MONTHS: 'Last 12 months',
  PREVIOUS_WEEK: 'Previous week',
  PREVIOUS_MONTH: 'Previous month',
  CURRENT_MONTH: 'Current month',
  CUSTOM: 'Custom range',
};

export const PERIOD_PRESET_LABELS_ES: Record<PeriodPreset, string> = {
  LAST_7_DAYS: 'Últimos 7 días',
  LAST_14_DAYS: 'Últimos 14 días',
  LAST_28_DAYS: 'Últimos 28 días',
  LAST_30_DAYS: 'Últimos 30 días',
  LAST_3_MONTHS: 'Últimos 3 meses',
  LAST_6_MONTHS: 'Últimos 6 meses',
  LAST_12_MONTHS: 'Últimos 12 meses',
  PREVIOUS_WEEK: 'Semana anterior',
  PREVIOUS_MONTH: 'Mes anterior',
  CURRENT_MONTH: 'Mes actual',
  CUSTOM: 'Periodo personalizado',
};

/** Google Search Console conserva 16 meses de datos de rendimiento. */
export const GSC_DATA_RETENTION_MONTHS = 16;
/** Retraso conservador por defecto hasta que GSC consolida datos finales. */
export const DEFAULT_DATA_DELAY_DAYS = 3;

export interface DateRange {
  startDate: IsoDate;
  endDate: IsoDate;
}

export type ComparisonAvailability = 'full' | 'partial' | 'unavailable';

export type PeriodNoteCode =
  | 'END_CAPPED_TO_AVAILABLE_DATA'
  | 'PERIOD_IN_PROGRESS'
  | 'COMPARISON_PARTIAL'
  | 'COMPARISON_UNAVAILABLE'
  | 'EQUIVALENT_DAYS_COMPARISON';

export interface PeriodNote {
  code: PeriodNoteCode;
  /** Fecha relevante para la nota (p. ej. última fecha disponible). */
  date?: IsoDate;
}

export interface ResolvedPeriod {
  preset: PeriodPreset;
  current: DateRange;
  previous: DateRange;
  days: number;
  previousDays: number;
  /** El periodo natural aún no ha terminado o fue recortado a los datos disponibles. */
  isPartial: boolean;
  previousAvailability: ComparisonAvailability;
  latestAvailableDate: IsoDate;
  earliestAvailableDate: IsoDate;
  comparison: 'previous_period' | 'previous_week' | 'previous_month' | 'previous_month_equivalent_days';
  notes: PeriodNote[];
}

export type PeriodErrorCode =
  | 'CUSTOM_RANGE_REQUIRED'
  | 'INVALID_RANGE'
  | 'NO_DATA_AVAILABLE_YET'
  | 'OUT_OF_RETENTION';

export class PeriodResolutionError extends Error {
  readonly code: PeriodErrorCode;

  constructor(code: PeriodErrorCode, message: string) {
    super(message);
    this.name = 'PeriodResolutionError';
    this.code = code;
  }
}

export interface ResolvePeriodOptions {
  /** "Hoy" en la zona horaria configurada. */
  today: IsoDate;
  /** Último día con datos finales en GSC (si se conoce). */
  latestAvailableDate?: IsoDate | null;
  /** Retraso a aplicar cuando no se conoce `latestAvailableDate`. */
  dataDelayDays?: number;
  custom?: Partial<DateRange> | null;
}

export function getEarliestAvailableDate(today: IsoDate): IsoDate {
  return addMonths(today, -GSC_DATA_RETENTION_MONTHS);
}

/** Último día utilizable: nunca hoy, y nunca posterior a lo que GSC reporta como final. */
export function resolveLatestAvailableDate(
  today: IsoDate,
  latestAvailableDate?: IsoDate | null,
  dataDelayDays: number = DEFAULT_DATA_DELAY_DAYS,
): IsoDate {
  const yesterday = addDays(today, -1);
  if (latestAvailableDate && isIsoDate(latestAvailableDate)) {
    return minIsoDate(latestAvailableDate, yesterday);
  }
  return addDays(today, -Math.max(1, dataDelayDays));
}

function immediatelyPrecedingRange(current: DateRange): DateRange {
  const days = daysInRange(current.startDate, current.endDate);
  const endDate = addDays(current.startDate, -1);
  return { startDate: addDays(endDate, -(days - 1)), endDate };
}

const LAST_N_DAYS: Partial<Record<PeriodPreset, number>> = {
  LAST_7_DAYS: 7,
  LAST_14_DAYS: 14,
  LAST_28_DAYS: 28,
  LAST_30_DAYS: 30,
};

const LAST_N_MONTHS: Partial<Record<PeriodPreset, number>> = {
  LAST_3_MONTHS: 3,
  LAST_6_MONTHS: 6,
  LAST_12_MONTHS: 12,
};

/**
 * Resuelve un preset de periodo en el rango actual y el rango de comparación equivalente.
 * Nunca incluye fechas posteriores al último día con datos disponibles.
 */
export function resolvePeriod(preset: PeriodPreset, options: ResolvePeriodOptions): ResolvedPeriod {
  const { today } = options;
  if (!isIsoDate(today)) throw new PeriodResolutionError('INVALID_RANGE', `Invalid reference date "${today}"`);

  const latest = resolveLatestAvailableDate(today, options.latestAvailableDate, options.dataDelayDays);
  const earliest = getEarliestAvailableDate(today);
  const notes: PeriodNote[] = [];
  let current: DateRange;
  let previous: DateRange;
  let isPartial = false;
  let comparison: ResolvedPeriod['comparison'] = 'previous_period';

  const lastDays = LAST_N_DAYS[preset];
  const lastMonths = LAST_N_MONTHS[preset];

  if (lastDays) {
    current = { startDate: addDays(latest, -(lastDays - 1)), endDate: latest };
    previous = immediatelyPrecedingRange(current);
  } else if (lastMonths) {
    current = { startDate: addDays(addMonths(latest, -lastMonths), 1), endDate: latest };
    previous = immediatelyPrecedingRange(current);
  } else if (preset === 'PREVIOUS_WEEK') {
    const weekStart = addDays(startOfIsoWeek(today), -7);
    const weekEnd = addDays(weekStart, 6);
    if (latest < weekStart) {
      throw new PeriodResolutionError(
        'NO_DATA_AVAILABLE_YET',
        `Search Console has no finalized data for the previous week yet (latest available date: ${latest}).`,
      );
    }
    const endDate = minIsoDate(weekEnd, latest);
    if (endDate < weekEnd) {
      isPartial = true;
      notes.push({ code: 'END_CAPPED_TO_AVAILABLE_DATA', date: endDate });
    }
    current = { startDate: weekStart, endDate };
    const days = daysInRange(current.startDate, current.endDate);
    const prevStart = addDays(weekStart, -7);
    previous = { startDate: prevStart, endDate: addDays(prevStart, days - 1) };
    comparison = 'previous_week';
  } else if (preset === 'PREVIOUS_MONTH') {
    const monthStart = startOfMonth(addMonths(startOfMonth(today), -1));
    const monthEnd = endOfMonth(monthStart);
    if (latest < monthStart) {
      throw new PeriodResolutionError(
        'NO_DATA_AVAILABLE_YET',
        `Search Console has no finalized data for the previous month yet (latest available date: ${latest}).`,
      );
    }
    const endDate = minIsoDate(monthEnd, latest);
    current = { startDate: monthStart, endDate };
    const prevStart = startOfMonth(addMonths(monthStart, -1));
    if (endDate < monthEnd) {
      isPartial = true;
      notes.push({ code: 'END_CAPPED_TO_AVAILABLE_DATA', date: endDate });
      const days = daysInRange(current.startDate, current.endDate);
      previous = { startDate: prevStart, endDate: minIsoDate(addDays(prevStart, days - 1), endOfMonth(prevStart)) };
      notes.push({ code: 'EQUIVALENT_DAYS_COMPARISON' });
      comparison = 'previous_month_equivalent_days';
    } else {
      previous = { startDate: prevStart, endDate: endOfMonth(prevStart) };
      comparison = 'previous_month';
    }
  } else if (preset === 'CURRENT_MONTH') {
    const monthStart = startOfMonth(today);
    if (latest < monthStart) {
      throw new PeriodResolutionError(
        'NO_DATA_AVAILABLE_YET',
        `Search Console has no finalized data for the current month yet (latest available date: ${latest}). Try "Previous month" or a custom range.`,
      );
    }
    current = { startDate: monthStart, endDate: latest };
    isPartial = latest < endOfMonth(monthStart);
    if (isPartial) notes.push({ code: 'PERIOD_IN_PROGRESS', date: latest });
    const days = daysInRange(current.startDate, current.endDate);
    const prevStart = startOfMonth(addMonths(monthStart, -1));
    previous = { startDate: prevStart, endDate: minIsoDate(addDays(prevStart, days - 1), endOfMonth(prevStart)) };
    notes.push({ code: 'EQUIVALENT_DAYS_COMPARISON' });
    comparison = 'previous_month_equivalent_days';
  } else {
    // CUSTOM
    const start = options.custom?.startDate;
    const end = options.custom?.endDate;
    if (!start || !end) {
      throw new PeriodResolutionError('CUSTOM_RANGE_REQUIRED', 'A custom period requires a start and an end date.');
    }
    if (!isIsoDate(start) || !isIsoDate(end)) {
      throw new PeriodResolutionError('INVALID_RANGE', 'Custom dates must use the YYYY-MM-DD format.');
    }
    if (start > end) {
      throw new PeriodResolutionError('INVALID_RANGE', 'The start date must be on or before the end date.');
    }
    if (start < earliest) {
      throw new PeriodResolutionError(
        'OUT_OF_RETENTION',
        `Search Console only keeps 16 months of data. The earliest available date is ${earliest}.`,
      );
    }
    if (start > latest) {
      throw new PeriodResolutionError(
        'NO_DATA_AVAILABLE_YET',
        `Search Console has no finalized data for the selected range yet (latest available date: ${latest}).`,
      );
    }
    const endDate = minIsoDate(end, latest);
    if (endDate < end) {
      isPartial = true;
      notes.push({ code: 'END_CAPPED_TO_AVAILABLE_DATA', date: endDate });
    }
    current = { startDate: start, endDate };
    previous = immediatelyPrecedingRange(current);
  }

  let previousAvailability: ComparisonAvailability = 'full';
  if (previous.endDate < earliest) {
    previousAvailability = 'unavailable';
    notes.push({ code: 'COMPARISON_UNAVAILABLE', date: earliest });
  } else if (previous.startDate < earliest) {
    previousAvailability = 'partial';
    notes.push({ code: 'COMPARISON_PARTIAL', date: earliest });
  }

  return {
    preset,
    current,
    previous,
    days: daysInRange(current.startDate, current.endDate),
    previousDays: daysInRange(previous.startDate, previous.endDate),
    isPartial,
    previousAvailability,
    latestAvailableDate: latest,
    earliestAvailableDate: earliest,
    comparison,
    notes,
  };
}

const COMPARISON_LABELS_EN: Record<ResolvedPeriod['comparison'], string> = {
  previous_period: 'vs. previous period',
  previous_week: 'vs. previous week',
  previous_month: 'vs. previous month',
  previous_month_equivalent_days: 'vs. same days of previous month',
};

const COMPARISON_LABELS_ES: Record<ResolvedPeriod['comparison'], string> = {
  previous_period: 'vs. periodo anterior',
  previous_week: 'vs. semana anterior',
  previous_month: 'vs. mes anterior',
  previous_month_equivalent_days: 'vs. mismos días del mes anterior',
};

export function comparisonLabel(period: ResolvedPeriod, lang: 'en' | 'es' = 'en'): string {
  const base = (lang === 'es' ? COMPARISON_LABELS_ES : COMPARISON_LABELS_EN)[period.comparison];
  if (period.comparison === 'previous_period') {
    return lang === 'es' ? `vs. ${period.previousDays} días anteriores` : `vs. previous ${period.previousDays} days`;
  }
  return base;
}

export function describeRange(range: DateRange): string {
  return formatDateRange(range.startDate, range.endDate);
}

export function formatPeriodNote(note: PeriodNote, lang: 'en' | 'es' = 'en'): string {
  const date = note.date ?? '';
  if (lang === 'es') {
    switch (note.code) {
      case 'END_CAPPED_TO_AVAILABLE_DATA':
        return `El periodo se ajustó hasta ${date}, último día con datos finales disponibles en Search Console.`;
      case 'PERIOD_IN_PROGRESS':
        return `El periodo aún está en curso; incluye datos hasta ${date}.`;
      case 'COMPARISON_PARTIAL':
        return `La comparación es parcial: Search Console solo conserva datos desde ${date}.`;
      case 'COMPARISON_UNAVAILABLE':
        return `No hay datos para el periodo de comparación: Search Console solo conserva datos desde ${date}.`;
      case 'EQUIVALENT_DAYS_COMPARISON':
        return 'La comparación usa el mismo número de días del mes anterior.';
    }
  }
  switch (note.code) {
    case 'END_CAPPED_TO_AVAILABLE_DATA':
      return `The period was capped at ${date}, the latest day with finalized Search Console data.`;
    case 'PERIOD_IN_PROGRESS':
      return `This period is still in progress; it includes data through ${date}.`;
    case 'COMPARISON_PARTIAL':
      return `The comparison is partial: Search Console only keeps data since ${date}.`;
    case 'COMPARISON_UNAVAILABLE':
      return `No comparison data: Search Console only keeps data since ${date}.`;
    case 'EQUIVALENT_DAYS_COMPARISON':
      return 'The comparison uses the same number of days from the previous month.';
  }
}
