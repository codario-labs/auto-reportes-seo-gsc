import type { PrismaClient } from '@prisma/client';
import { googleConfigStatus, type Env } from './config/env';
import { TokenCipher } from './lib/crypto';
import type { Logger } from './lib/logger';
import { StorageService } from './lib/storage';
import { AccessService } from './modules/access/access.service';
import { AnthropicService } from './modules/ai/anthropic.service';
import { GoogleConnectionService } from './modules/google/connection.service';
import { GooglePropertiesService } from './modules/google/properties.service';
import { FreshnessService } from './modules/gsc/freshness';
import { SearchConsoleClient } from './modules/gsc/gsc.client';
import { MarketsService } from './modules/markets/markets.service';
import { PdfRenderer } from './modules/pdf/pdf.renderer';
import { PerformanceService } from './modules/reports/performance.service';
import { ReportPipeline } from './modules/reports/report.pipeline';
import { ReportQueue } from './modules/reports/report.queue';
import { ReportsService } from './modules/reports/reports.service';
import { SettingsService } from './modules/settings/settings.service';
import { TemplatesService } from './modules/templates/templates.service';

export interface Container {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  storage: StorageService;
  access: AccessService;
  settings: SettingsService;
  templates: TemplatesService;
  google: GoogleConnectionService;
  properties: GooglePropertiesService;
  performance: PerformanceService;
  markets: MarketsService;
  anthropic: AnthropicService;
  renderer: PdfRenderer;
  reports: ReportsService;
  queue: ReportQueue;
  pdfStatus: { available: boolean | null };
}

export interface ContainerOverrides {
  fetchImpl?: typeof fetch;
  anthropic?: AnthropicService;
  renderer?: PdfRenderer;
}

export function createContainer(env: Env, prisma: PrismaClient, logger: Logger, overrides: ContainerOverrides = {}): Container {
  const storage = new StorageService(env.STORAGE_DIR);
  const cipher = new TokenCipher(env.TOKEN_ENCRYPTION_KEY);
  const access = new AccessService({
    accessKey: env.APP_ACCESS_KEY,
    sessionSecret: env.SESSION_SECRET,
    ttlHours: env.SESSION_TTL_HOURS,
    secureCookies: env.APP_URL.startsWith('https://'),
  });
  const settings = new SettingsService(prisma, storage, logger, { timezone: env.APP_TIMEZONE, envLogoPath: env.CODARIO_LOGO_PATH });
  const templates = new TemplatesService(prisma);
  const googleStatus = googleConfigStatus(env);
  const google = new GoogleConnectionService({
    prisma,
    cipher,
    logger,
    oauthConfig: googleStatus.configured
      ? {
          clientId: env.GOOGLE_OAUTH_CLIENT_ID!,
          clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
          redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI!,
        }
      : null,
    missingConfig: googleStatus.missing,
    redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI ?? null,
    fetchImpl: overrides.fetchImpl,
  });
  const gscClientFactory = () =>
    new SearchConsoleClient((options) => google.getAccessToken(options), { fetchImpl: overrides.fetchImpl });
  const properties = new GooglePropertiesService(prisma, google, gscClientFactory, logger);
  const performance = new PerformanceService(
    prisma,
    google,
    settings,
    new FreshnessService(),
    env.GSC_MAX_ROWS_PER_DIMENSION,
    overrides.fetchImpl,
  );
  const markets = new MarketsService(prisma, storage, properties, logger);
  const anthropic =
    overrides.anthropic ??
    new AnthropicService(
      {
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL,
        effort: env.ANTHROPIC_EFFORT,
        maxOutputTokens: env.ANTHROPIC_MAX_OUTPUT_TOKENS,
        timeoutMs: env.ANTHROPIC_TIMEOUT_MS,
        maxRetries: env.ANTHROPIC_MAX_RETRIES,
        enableFallback: env.ANTHROPIC_ENABLE_FALLBACK,
      },
      logger,
    );
  const renderer = overrides.renderer ?? new PdfRenderer(logger);
  const reports = new ReportsService(prisma, performance, templates, anthropic, storage, logger);
  const pipeline = new ReportPipeline({
    prisma,
    performance,
    anthropic,
    renderer,
    storage,
    settings,
    markets,
    logger,
    maxRowsPerDimension: env.GSC_MAX_ROWS_PER_DIMENSION,
  });
  const queue = new ReportQueue(pipeline.run, {
    concurrency: env.REPORT_WORKER_CONCURRENCY,
    timeoutMs: env.REPORT_JOB_TIMEOUT_MS,
    logger,
  });
  reports.attachQueue(queue);

  return {
    env,
    logger,
    prisma,
    storage,
    access,
    settings,
    templates,
    google,
    properties,
    performance,
    markets,
    anthropic,
    renderer,
    reports,
    queue,
    pdfStatus: { available: null },
  };
}
