import { describe, expect, it } from 'vitest';
import {
  computeDelta,
  computeTotalsDeltas,
  formatAbsoluteChange,
  formatMetricValue,
  formatPercentChange,
} from '../metrics';

describe('computeDelta', () => {
  it('treats more clicks as positive', () => {
    const d = computeDelta('clicks', 120, 100);
    expect(d.absoluteChange).toBe(20);
    expect(d.percentChange).toBeCloseTo(0.2);
    expect(d.direction).toBe('up');
    expect(d.sentiment).toBe('positive');
  });

  it('treats a lower average position as an improvement', () => {
    const d = computeDelta('position', 8.2, 11.4);
    expect(d.direction).toBe('down');
    expect(d.sentiment).toBe('positive');
  });

  it('treats a higher average position as a decline', () => {
    const d = computeDelta('position', 14, 9);
    expect(d.direction).toBe('up');
    expect(d.sentiment).toBe('negative');
  });

  it('returns null percent change when the previous value is zero', () => {
    const d = computeDelta('clicks', 10, 0);
    expect(d.percentChange).toBeNull();
    expect(d.absoluteChange).toBe(10);
  });

  it('is neutral when there is no previous data', () => {
    const d = computeDelta('ctr', 0.03, null);
    expect(d.absoluteChange).toBeNull();
    expect(d.sentiment).toBe('neutral');
  });

  it('treats tiny CTR differences as flat', () => {
    expect(computeDelta('ctr', 0.03001, 0.03).direction).toBe('flat');
  });

  it('computes deltas for every metric', () => {
    const deltas = computeTotalsDeltas(
      { clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
      { clicks: 5, impressions: 100, ctr: 0.05, position: 6 },
    );
    expect(deltas.map((d) => d.metric)).toEqual(['clicks', 'impressions', 'ctr', 'position']);
    expect(deltas.map((d) => d.sentiment)).toEqual(['positive', 'neutral', 'positive', 'positive']);
  });
});

describe('formatting', () => {
  it('formats metric values', () => {
    expect(formatMetricValue('clicks', 1234)).toBe('1,234');
    expect(formatMetricValue('ctr', 0.0345)).toBe('3.45%');
    expect(formatMetricValue('position', 7.26)).toBe('7.3');
    expect(formatMetricValue('position', null)).toBe('—');
  });

  it('formats Spanish values with grouping', () => {
    expect(formatMetricValue('clicks', 1234, 'es')).toBe('1.234');
  });

  it('formats changes with explicit signs', () => {
    expect(formatPercentChange(0.123)).toBe('+12.3%');
    expect(formatPercentChange(-0.05)).toBe('−5.0%');
    expect(formatPercentChange(null)).toBe('n/a');
    expect(formatAbsoluteChange('ctr', 0.0042)).toBe('+0.42 pp');
    expect(formatAbsoluteChange('position', -1.34)).toBe('−1.3');
    expect(formatAbsoluteChange('clicks', -20)).toBe('−20');
  });
});
