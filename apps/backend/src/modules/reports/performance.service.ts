import {
  getEarliestAvailableDate,
  resolvePeriod,
  todayInTimeZone,
  type DataFreshness,
  type FreshnessDTO,
  type PeriodPreset,
  type ReportDataset,
  type ResolvedPeriod,
} from '@codario/shared';
import type { Market, PrismaClient } from '@prisma/client';
import { Errors } from '../../lib/errors';
import { buildDataset, mapGscError } from '../analytics/dataset.builder';
import type { GoogleConnectionService } from '../google/connection.service';
import type { FreshnessService } from '../gsc/freshness';
import { SearchConsoleClient } from '../gsc/gsc.client';
import type { SettingsService } from '../settings/settings.service';

const PERFORMANCE_CACHE_TTL_MS = 10 * 60_000;

export interface PeriodRequest {
  preset: PeriodPreset;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Acceso a los datos de Search Console de un market: frescura de datos, resolución de periodos
 * y dataset de rendimiento en vivo (con caché corta para ahorrar cuota de la API).
 */
export class PerformanceService {
  private readonly cache = new Map<string, { value: ReportDataset; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly connections: GoogleConnectionService,
    private readonly settings: SettingsService,
    readonly freshness: FreshnessService,
    private readonly maxRowsPerDimension: number,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  createClient(signal?: AbortSignal): SearchConsoleClient {
    return new SearchConsoleClient((options) => this.connections.getAccessToken(options), { signal, fetchImpl: this.fetchImpl });
  }

  /** Valida que el market tenga propiedad GSC y que exista una conexión de Google utilizable. */
  async resolveSiteUrl(market: Market): Promise<string> {
    if (!market.gscSiteUrl) throw Errors.propertyMissing();
    if (!this.connections.isConfigured) throw Errors.googleNotConfigured(this.connections.missingConfig);
    const connection = await this.connections.getConnection();
    if (!connection || connection.status === 'REVOKED') throw Errors.googleNotConnected();
    const property = await this.prisma.googleProperty.findUnique({
      where: { connectionId_siteUrl: { connectionId: connection.id, siteUrl: market.gscSiteUrl } },
    });
    if (property && !property.isAccessible) throw Errors.propertyInaccessible(market.gscSiteUrl);
    return market.gscSiteUrl;
  }

  async getMarket(marketId: string): Promise<Market> {
    const market = await this.prisma.market.findUnique({ where: { id: marketId } });
    if (!market) throw Errors.notFound('Market');
    return market;
  }

  async getFreshnessFor(market: Market, options: { force?: boolean; signal?: AbortSignal } = {}): Promise<{ freshness: DataFreshness; today: string; timezone: string; dataDelayDays: number }> {
    const siteUrl = await this.resolveSiteUrl(market);
    const settings = await this.settings.get();
    const today = todayInTimeZone(settings.timezone);
    try {
      const freshness = await this.freshness.getFreshness(this.createClient(options.signal), siteUrl, today, settings.dataDelayDays, {
        force: options.force,
      });
      return { freshness, today, timezone: settings.timezone, dataDelayDays: settings.dataDelayDays };
    } catch (error) {
      throw mapGscError(error, siteUrl);
    }
  }

  async getFreshnessDTO(marketId: string, force = false): Promise<FreshnessDTO> {
    const market = await this.getMarket(marketId);
    const { freshness, today, timezone } = await this.getFreshnessFor(market, { force });
    return {
      today,
      timezone,
      latestAvailableDate: freshness.latestAvailableDate,
      earliestAvailableDate: getEarliestAvailableDate(today),
      firstIncompleteDate: freshness.firstIncompleteDate,
      source: freshness.source,
    };
  }

  async resolvePeriodFor(market: Market, request: PeriodRequest, options: { signal?: AbortSignal } = {}): Promise<{ period: ResolvedPeriod; freshness: DataFreshness }> {
    const { freshness, today, dataDelayDays } = await this.getFreshnessFor(market, options);
    const period = resolvePeriod(request.preset, {
      today,
      latestAvailableDate: freshness.latestAvailableDate,
      dataDelayDays,
      custom: request.preset === 'CUSTOM' ? { startDate: request.startDate ?? undefined, endDate: request.endDate ?? undefined } : null,
    });
    return { period, freshness };
  }

  async getPerformance(marketId: string, request: PeriodRequest & { refresh?: boolean }): Promise<ReportDataset> {
    const market = await this.getMarket(marketId);
    const { period, freshness } = await this.resolvePeriodFor(market, request);
    const key = `${marketId}|${market.gscSiteUrl}|${period.current.startDate}|${period.current.endDate}|${period.previous.startDate}`;
    const cached = this.cache.get(key);
    if (!request.refresh && cached && cached.expiresAt > Date.now()) return cached.value;
    const client = this.createClient();
    const dataset = await buildDataset({
      client,
      siteUrl: market.gscSiteUrl!,
      period,
      freshness,
      maxRowsPerDimension: this.maxRowsPerDimension,
    });
    this.cache.set(key, { value: dataset, expiresAt: Date.now() + PERFORMANCE_CACHE_TTL_MS });
    if (this.cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of this.cache) if (v.expiresAt < now) this.cache.delete(k);
    }
    return dataset;
  }

  invalidate(): void {
    this.cache.clear();
    this.freshness.invalidate();
  }
}
