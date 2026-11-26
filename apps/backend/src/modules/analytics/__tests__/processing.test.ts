import { resolvePeriod } from '@codario/shared';
import { describe, expect, it } from 'vitest';
import { createFakeGoogle } from '../../../test/fake-google';
import { SearchConsoleClient } from '../../gsc/gsc.client';
import { buildDataset } from '../dataset.builder';
import { analyzeDimension, buildTimeseries, compareRows, computeBenchmarkCtr, toTotals, type KeyedRow } from '../processing';

const row = (key: string, clicks: number, impressions: number, position: number): KeyedRow => ({
  key,
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

describe('GSC data transformations', () => {
  it('maps totals and keeps CTR/position null without impressions', () => {
    expect(toTotals({ rows: [{ clicks: 10, impressions: 200, ctr: 0.05, position: 7.5 }] })).toEqual({
      clicks: 10,
      impressions: 200,
      ctr: 0.05,
      position: 7.5,
    });
    expect(toTotals({})).toEqual({ clicks: 0, impressions: 0, ctr: null, position: null });
  });

  it('fills missing days as zero impressions without inventing CTR or position', () => {
    const series = buildTimeseries(
      [{ keys: ['2026-11-01'], clicks: 5, impressions: 100, ctr: 0.05, position: 4 }],
      { startDate: '2026-11-01', endDate: '2026-11-03' },
    );
    expect(series).toHaveLength(3);
    expect(series[1]).toEqual({ date: '2026-11-02', clicks: 0, impressions: 0, ctr: null, position: null, hasData: false });
    expect(series[0]?.hasData).toBe(true);
  });

  it('joins current and previous rows and flags lost items', () => {
    const compared = compareRows([row('a', 10, 100, 3)], [row('a', 4, 80, 5), row('b', 7, 70, 6)]);
    const a = compared.find((r) => r.key === 'a')!;
    expect(a.change.clicks).toBe(6);
    expect(a.change.clicksPct).toBeCloseTo(1.5);
    expect(a.change.position).toBe(-2);
    const b = compared.find((r) => r.key === 'b')!;
    expect(b.current).toBeNull();
    expect(b.change.clicks).toBe(-7);
  });

  it('computes the CTR benchmark from the site own rows per position bucket', () => {
    const rows = [row('a', 30, 100, 1.5), row('b', 20, 100, 2), row('c', 25, 100, 2.5), row('d', 1, 100, 15)];
    const benchmark = computeBenchmarkCtr(rows, 10);
    expect(benchmark[0]).toBeCloseTo(0.25);
    expect(benchmark[3]).toBe(0); // menos de 3 filas en el rango: sin referencia
  });

  it('detects gainers, losers, new items and striking-distance queries', () => {
    const current = [row('up', 50, 500, 3), row('down', 5, 400, 9), row('new', 8, 300, 12), row('steady', 20, 200, 4), row('far', 2, 900, 14)];
    const previous = [row('up', 10, 300, 5), row('down', 30, 500, 6), row('steady', 20, 210, 4), row('gone', 9, 90, 8), row('far', 3, 800, 15)];
    const totals = { clicks: 85, impressions: 2300, ctr: 85 / 2300, position: 8 };
    const analysis = analyzeDimension(current, previous, totals, { hasComparison: true });
    expect(analysis.gainers[0]?.key).toBe('up');
    expect(analysis.losers[0]?.key).toBe('down');
    expect(analysis.newItems.map((r) => r.key)).toContain('new');
    expect(analysis.lostItems.map((r) => r.key)).toEqual(['gone']);
    // Umbral adaptativo = mediana de impresiones (400): "new" (300 impr.) queda fuera.
    expect(analysis.strikingDistance.map((r) => r.key)).toEqual(['far', 'down']);
    expect(analysis.top[0]?.key).toBe('up');
    expect(analysis.coverage.clicks).toBeCloseTo(1);
  });

  it('skips movers when there is no comparison data', () => {
    const analysis = analyzeDimension([row('a', 5, 50, 3)], null, { clicks: 5, impressions: 50, ctr: 0.1, position: 3 }, { hasComparison: false });
    expect(analysis.gainers).toEqual([]);
    expect(analysis.newItems).toEqual([]);
    expect(analysis.status).toBe('ok');
  });
});

describe('buildDataset (with simulated GSC responses)', () => {
  const period = resolvePeriod('LAST_28_DAYS', { today: '2026-11-24', latestAvailableDate: '2026-11-21' });
  const freshness = { latestAvailableDate: '2026-11-21', source: 'gsc_metadata' as const, firstIncompleteDate: '2026-11-22', dataState: 'final' as const, checkedAt: '' };

  it('builds a complete dataset from GSC responses', async () => {
    const google = createFakeGoogle({ firstIncompleteDate: '2026-11-22' });
    const client = new SearchConsoleClient(async () => 'token', { fetchImpl: google.fetch });
    const dataset = await buildDataset({ client, siteUrl: 'sc-domain:codariolabs.com', period, freshness, maxRowsPerDimension: 1000 });
    expect(dataset.dataQuality.hasData).toBe(true);
    expect(dataset.timeseries.current).toHaveLength(28);
    expect(dataset.timeseries.previous).toHaveLength(28);
    expect(dataset.queries.status).toBe('ok');
    expect(dataset.queries.top.length).toBeGreaterThan(5);
    expect(dataset.devices.rows.map((r) => r.key)).toContain('MOBILE');
    expect(dataset.totals.deltas).toHaveLength(4);
    expect(dataset.stats.gscRequests).toBeGreaterThan(10);
    // Todas las consultas usan solo datos finales.
    const bodies = google.calls.filter((c) => c.url.includes('searchAnalytics')).map((c) => c.body as { dataState: string });
    expect(bodies.every((b) => b.dataState === 'final')).toBe(true);
  });

  it('distinguishes empty results from errors', async () => {
    const google = createFakeGoogle({ firstIncompleteDate: '2026-11-22', failingDimensions: ['country'] });
    const client = new SearchConsoleClient(async () => 'token', { fetchImpl: google.fetch, retryBaseMs: 1, maxRetries: 1 });
    const dataset = await buildDataset({ client, siteUrl: 'sc-domain:codariolabs.com', period, freshness, maxRowsPerDimension: 1000 });
    expect(dataset.countries.status).toBe('error');
    expect(dataset.dataQuality.issues).toContainEqual(expect.objectContaining({ code: 'SECTION_ERROR', dimension: 'country' }));

    const emptyGoogle = createFakeGoogle({ firstIncompleteDate: '2026-11-22', empty: true });
    const emptyClient = new SearchConsoleClient(async () => 'token', { fetchImpl: emptyGoogle.fetch });
    const empty = await buildDataset({ client: emptyClient, siteUrl: 'sc-domain:codariolabs.com', period, freshness, maxRowsPerDimension: 1000 });
    expect(empty.dataQuality.hasData).toBe(false);
    expect(empty.queries.status).toBe('empty');
    expect(empty.totals.current.ctr).toBeNull();
    expect(empty.dataQuality.issues[0]?.code).toBe('NO_DATA_CURRENT');
  });

  it('maps permission errors to an inaccessible-property error', async () => {
    const google = createFakeGoogle({ firstIncompleteDate: '2026-11-22', forbiddenSites: ['sc-domain:codariolabs.com'] });
    const client = new SearchConsoleClient(async () => 'token', { fetchImpl: google.fetch });
    await expect(
      buildDataset({ client, siteUrl: 'sc-domain:codariolabs.com', period, freshness, maxRowsPerDimension: 1000 }),
    ).rejects.toMatchObject({ code: 'GSC_PROPERTY_INACCESSIBLE' });
  });
});
