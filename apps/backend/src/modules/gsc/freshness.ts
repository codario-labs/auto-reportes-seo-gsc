import { addDays, isIsoDate, minIsoDate, type DataFreshness, type IsoDate } from '@codario/shared';
import type { SearchConsoleClient } from './gsc.client';

const CACHE_TTL_MS = 30 * 60_000;

/**
 * Determina el último día con datos FINALES en Search Console.
 * Consulta con dataState=all agrupado por fecha: GSC indica en metadata.first_incomplete_date
 * el primer día cuyos datos aún se están procesando.
 */
export class FreshnessService {
  private readonly cache = new Map<string, { value: DataFreshness; expiresAt: number }>();

  async getFreshness(
    client: SearchConsoleClient,
    siteUrl: string,
    today: IsoDate,
    dataDelayDays: number,
    options: { force?: boolean } = {},
  ): Promise<DataFreshness> {
    const cacheKey = `${siteUrl}|${today}`;
    const cached = this.cache.get(cacheKey);
    if (!options.force && cached && cached.expiresAt > Date.now()) return cached.value;

    const yesterday = addDays(today, -1);
    const response = await client.querySearchAnalytics(siteUrl, {
      startDate: addDays(today, -10),
      endDate: today,
      dimensions: ['date'],
      type: 'web',
      dataState: 'all',
      rowLimit: 20,
    });
    const firstIncomplete = response.metadata?.first_incomplete_date ?? null;
    let value: DataFreshness;
    if (firstIncomplete && isIsoDate(firstIncomplete)) {
      value = {
        latestAvailableDate: minIsoDate(addDays(firstIncomplete, -1), yesterday),
        source: 'gsc_metadata',
        firstIncompleteDate: firstIncomplete,
        dataState: 'final',
        checkedAt: new Date().toISOString(),
      };
    } else {
      // Sin metadatos (p. ej. sin datos recientes): estimación conservadora con el retraso configurado.
      value = {
        latestAvailableDate: addDays(today, -Math.max(1, dataDelayDays)),
        source: 'estimated',
        firstIncompleteDate: null,
        dataState: 'final',
        checkedAt: new Date().toISOString(),
      };
    }
    this.cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  invalidate(siteUrl?: string): void {
    if (!siteUrl) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) if (key.startsWith(`${siteUrl}|`)) this.cache.delete(key);
  }
}
