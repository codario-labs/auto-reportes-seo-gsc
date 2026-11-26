import {
  DEFAULT_DATA_DELAY_DAYS,
  getEarliestAvailableDate,
  resolveLatestAvailableDate,
  resolvePeriod,
  todayInTimeZone,
  type IsoDate,
  type PeriodPreset,
  type ResolvedPeriod,
} from '@codario/shared';
import { useMemo } from 'react';
import { useMarketFreshness, useSettings } from '@/features/api-hooks';

export interface PeriodValue {
  preset: PeriodPreset;
  startDate?: string;
  endDate?: string;
}

export function isoToLocalDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function localDateToIso(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface PeriodContext {
  today: IsoDate;
  latestAvailableDate: IsoDate;
  earliestAvailableDate: IsoDate;
  dataDelayDays: number;
  source: 'gsc_metadata' | 'estimated';
}

/** Fecha de referencia y disponibilidad de datos (desde GSC si hay market; estimada si no). */
export function usePeriodContext(marketId?: string | null): PeriodContext {
  const settings = useSettings();
  const freshness = useMarketFreshness(marketId);
  return useMemo(() => {
    const dataDelayDays = settings.data?.dataDelayDays ?? DEFAULT_DATA_DELAY_DAYS;
    if (freshness.data) {
      return {
        today: freshness.data.today,
        latestAvailableDate: freshness.data.latestAvailableDate,
        earliestAvailableDate: freshness.data.earliestAvailableDate,
        dataDelayDays,
        source: freshness.data.source,
      };
    }
    const timezone = settings.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = todayInTimeZone(timezone);
    return {
      today,
      latestAvailableDate: resolveLatestAvailableDate(today, null, dataDelayDays),
      earliestAvailableDate: getEarliestAvailableDate(today),
      dataDelayDays,
      source: 'estimated' as const,
    };
  }, [freshness.data, settings.data]);
}

export function resolvePeriodSafe(
  value: PeriodValue,
  context: PeriodContext,
): { period: ResolvedPeriod; error: null } | { period: null; error: string } {
  try {
    return {
      period: resolvePeriod(value.preset, {
        today: context.today,
        latestAvailableDate: context.latestAvailableDate,
        dataDelayDays: context.dataDelayDays,
        custom: { startDate: value.startDate, endDate: value.endDate },
      }),
      error: null,
    };
  } catch (error) {
    return { period: null, error: error instanceof Error ? error.message : 'Invalid period' };
  }
}

export function periodToInput(value: PeriodValue): {
  periodPreset: PeriodPreset;
  customStartDate?: string | null;
  customEndDate?: string | null;
} {
  return value.preset === 'CUSTOM'
    ? { periodPreset: 'CUSTOM', customStartDate: value.startDate ?? null, customEndDate: value.endDate ?? null }
    : { periodPreset: value.preset };
}
