import { describe, expect, it } from 'vitest';
import { addMonths, daysInRange, startOfIsoWeek, todayInTimeZone } from '../dates';
import { PeriodResolutionError, resolveLatestAvailableDate, resolvePeriod } from '../periods';

const today = '2026-11-24'; // martes

describe('date helpers', () => {
  it('adds months clamping to month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('finds the ISO week start (Monday)', () => {
    expect(startOfIsoWeek('2026-11-24')).toBe('2026-11-23');
    expect(startOfIsoWeek('2026-11-29')).toBe('2026-11-23'); // domingo
    expect(startOfIsoWeek('2026-11-23')).toBe('2026-11-23');
  });

  it('computes today in a time zone', () => {
    const now = new Date('2026-11-25T03:00:00Z');
    expect(todayInTimeZone('America/Bogota', now)).toBe('2026-11-24');
    expect(todayInTimeZone('Europe/Madrid', now)).toBe('2026-11-25');
  });
});

describe('resolveLatestAvailableDate', () => {
  it('uses the delay when GSC freshness is unknown', () => {
    expect(resolveLatestAvailableDate(today, null, 3)).toBe('2026-11-21');
  });

  it('never returns today or a future date', () => {
    expect(resolveLatestAvailableDate(today, '2026-11-24')).toBe('2026-11-23');
    expect(resolveLatestAvailableDate(today, '2026-11-20')).toBe('2026-11-20');
  });
});

describe('resolvePeriod', () => {
  const latestAvailableDate = '2026-11-21';

  it('resolves last 7 days vs previous 7 days', () => {
    const p = resolvePeriod('LAST_7_DAYS', { today, latestAvailableDate });
    expect(p.current).toEqual({ startDate: '2026-11-15', endDate: '2026-11-21' });
    expect(p.previous).toEqual({ startDate: '2026-11-08', endDate: '2026-11-14' });
    expect(p.days).toBe(7);
    expect(p.previousDays).toBe(7);
    expect(p.previousAvailability).toBe('full');
  });

  it('resolves last 28 days with an equal-length comparison', () => {
    const p = resolvePeriod('LAST_28_DAYS', { today, latestAvailableDate });
    expect(daysInRange(p.current.startDate, p.current.endDate)).toBe(28);
    expect(daysInRange(p.previous.startDate, p.previous.endDate)).toBe(28);
    expect(p.previous.endDate).toBe('2026-10-24');
  });

  it('resolves last 3 months by calendar months', () => {
    const p = resolvePeriod('LAST_3_MONTHS', { today, latestAvailableDate });
    expect(p.current).toEqual({ startDate: '2026-08-22', endDate: '2026-11-21' });
    expect(p.previousDays).toBe(p.days);
  });

  it('flags a partial comparison for the last 12 months (16-month retention)', () => {
    const p = resolvePeriod('LAST_12_MONTHS', { today, latestAvailableDate });
    expect(p.previousAvailability).toBe('partial');
    expect(p.notes.some((n) => n.code === 'COMPARISON_PARTIAL')).toBe(true);
  });

  it('resolves the previous ISO week (Mon–Sun) vs the week before', () => {
    const p = resolvePeriod('PREVIOUS_WEEK', { today, latestAvailableDate });
    expect(p.current).toEqual({ startDate: '2026-11-16', endDate: '2026-11-21' });
    expect(p.isPartial).toBe(true); // el domingo 22 aún no tiene datos finales
    expect(p.previous).toEqual({ startDate: '2026-11-09', endDate: '2026-11-14' });
  });

  it('resolves the full previous week when data is available', () => {
    const p = resolvePeriod('PREVIOUS_WEEK', { today: '2026-11-27', latestAvailableDate: '2026-11-24' });
    expect(p.current).toEqual({ startDate: '2026-11-16', endDate: '2026-11-22' });
    expect(p.isPartial).toBe(false);
    expect(p.previous).toEqual({ startDate: '2026-11-09', endDate: '2026-11-15' });
  });

  it('resolves the previous month vs the full month before', () => {
    const p = resolvePeriod('PREVIOUS_MONTH', { today, latestAvailableDate });
    expect(p.current).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(p.previous).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(p.comparison).toBe('previous_month');
  });

  it('caps the previous month and compares equivalent days when data is not final yet', () => {
    const p = resolvePeriod('PREVIOUS_MONTH', { today: '2026-12-02', latestAvailableDate: '2026-11-29' });
    expect(p.current).toEqual({ startDate: '2026-11-01', endDate: '2026-11-29' });
    expect(p.previous).toEqual({ startDate: '2026-10-01', endDate: '2026-10-29' });
    expect(p.comparison).toBe('previous_month_equivalent_days');
  });

  it('compares the current month with the same days of the previous month', () => {
    const p = resolvePeriod('CURRENT_MONTH', { today, latestAvailableDate });
    expect(p.current).toEqual({ startDate: '2026-11-01', endDate: '2026-11-21' });
    expect(p.previous).toEqual({ startDate: '2026-10-01', endDate: '2026-10-21' });
    expect(p.isPartial).toBe(true);
  });

  it('caps equivalent days to the end of a shorter previous month', () => {
    const p = resolvePeriod('CURRENT_MONTH', { today: '2026-03-31', latestAvailableDate: '2026-03-30' });
    expect(p.previous).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' });
  });

  it('throws when the current month has no finalized data yet', () => {
    expect(() => resolvePeriod('CURRENT_MONTH', { today: '2026-12-02', latestAvailableDate: '2026-11-29' })).toThrow(
      PeriodResolutionError,
    );
  });

  it('resolves a custom range vs the immediately preceding range', () => {
    const p = resolvePeriod('CUSTOM', {
      today,
      latestAvailableDate,
      custom: { startDate: '2026-10-01', endDate: '2026-10-10' },
    });
    expect(p.current).toEqual({ startDate: '2026-10-01', endDate: '2026-10-10' });
    expect(p.previous).toEqual({ startDate: '2026-09-21', endDate: '2026-09-30' });
  });

  it('caps a custom range that ends after the latest available date', () => {
    const p = resolvePeriod('CUSTOM', {
      today,
      latestAvailableDate,
      custom: { startDate: '2026-11-10', endDate: '2026-11-23' },
    });
    expect(p.current.endDate).toBe('2026-11-21');
    expect(p.notes[0]?.code).toBe('END_CAPPED_TO_AVAILABLE_DATA');
  });

  it('validates custom ranges', () => {
    expect(() => resolvePeriod('CUSTOM', { today })).toThrow(/custom period/i);
    expect(() =>
      resolvePeriod('CUSTOM', { today, custom: { startDate: '2026-10-10', endDate: '2026-10-01' } }),
    ).toThrow(/start date/i);
    expect(() =>
      resolvePeriod('CUSTOM', { today, custom: { startDate: '2024-01-01', endDate: '2024-02-01' } }),
    ).toThrow(/16 months/);
  });
});
