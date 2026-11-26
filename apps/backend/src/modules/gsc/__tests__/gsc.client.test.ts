import { describe, expect, it, vi } from 'vitest';
import { FreshnessService } from '../freshness';
import { GscApiError, SearchConsoleClient } from '../gsc.client';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

describe('SearchConsoleClient', () => {
  it('sends the bearer token and encodes the site URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rows: [] }));
    const client = new SearchConsoleClient(async () => 'token-1', { fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.querySearchAnalytics('sc-domain:example.com', { startDate: '2026-01-01', endDate: '2026-01-02' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });

  it('paginates with startRow until results are exhausted', async () => {
    const pages = [Array(25_000).fill({ keys: ['a'], clicks: 1, impressions: 1, ctr: 1, position: 1 }), Array(10).fill({ keys: ['b'], clicks: 1, impressions: 1, ctr: 1, position: 1 })];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { startRow: number };
      return jsonResponse({ rows: body.startRow === 0 ? pages[0] : pages[1] });
    });
    const client = new SearchConsoleClient(async () => 't', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await client.queryAllRows('https://example.com/', { startDate: '2026-01-01', endDate: '2026-01-31', dimensions: ['query'] }, 100_000);
    expect(result.rows).toHaveLength(25_010);
    expect(result.truncated).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('marks results as truncated when the row cap is reached', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { rowLimit: number };
      return jsonResponse({ rows: Array(body.rowLimit).fill({ keys: ['a'], clicks: 1, impressions: 1, ctr: 1, position: 1 }) });
    });
    const client = new SearchConsoleClient(async () => 't', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await client.queryAllRows('https://example.com/', { startDate: '2026-01-01', endDate: '2026-01-31', dimensions: ['page'] }, 500);
    expect(result.rows).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it('retries rate limits and server errors with backoff', async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) return jsonResponse({ error: { message: 'Quota' } }, 429);
      if (attempt === 2) return jsonResponse({ error: { message: 'Backend' } }, 503);
      return jsonResponse({ siteEntry: [] });
    });
    const client = new SearchConsoleClient(async () => 't', { fetchImpl: fetchImpl as unknown as typeof fetch, retryBaseMs: 1 });
    await expect(client.listSites()).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('forces a token refresh once on 401', async () => {
    const getToken = vi.fn(async (o?: { forceRefresh?: boolean }) => (o?.forceRefresh ? 'fresh' : 'stale'));
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
      (init.headers as Record<string, string>).Authorization === 'Bearer fresh' ? jsonResponse({ siteEntry: [{ siteUrl: 'x', permissionLevel: 'siteOwner' }] }) : jsonResponse({ error: { message: 'Invalid Credentials' } }, 401),
    );
    const client = new SearchConsoleClient(getToken, { fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.listSites()).resolves.toHaveLength(1);
    expect(getToken).toHaveBeenLastCalledWith({ forceRefresh: true });
  });

  it('throws typed errors with the API reason', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { code: 403, message: 'User does not have sufficient permission', errors: [{ reason: 'forbidden' }] } }, 403),
    );
    const client = new SearchConsoleClient(async () => 't', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = await client.getSite('https://x.com/').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GscApiError);
    expect((error as GscApiError).status).toBe(403);
    expect((error as GscApiError).reason).toBe('forbidden');
  });
});

describe('FreshnessService', () => {
  it('uses first_incomplete_date from GSC metadata', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ rows: [], metadata: { first_incomplete_date: '2026-11-22' } }));
    const client = new SearchConsoleClient(async () => 't', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const freshness = await new FreshnessService().getFreshness(client, 'sc-domain:x.com', '2026-11-24', 3);
    expect(freshness.latestAvailableDate).toBe('2026-11-21');
    expect(freshness.source).toBe('gsc_metadata');
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as { dataState: string };
    expect(body.dataState).toBe('all');
  });

  it('falls back to a conservative estimate without metadata', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const client = new SearchConsoleClient(async () => 't', { fetchImpl: fetchImpl as unknown as typeof fetch });
    const freshness = await new FreshnessService().getFreshness(client, 'sc-domain:x.com', '2026-11-24', 3);
    expect(freshness.latestAvailableDate).toBe('2026-11-21');
    expect(freshness.source).toBe('estimated');
  });
});
