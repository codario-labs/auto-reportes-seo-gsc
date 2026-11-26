/**
 * Contrato de la API REST (DTOs) compartido entre backend y frontend.
 * Todas las fechas-hora son ISO 8601 (string); las fechas de calendario son YYYY-MM-DD.
 */
import type { IsoDate } from './dates';
import type { MetricKey } from './metrics';
import type { PeriodPreset } from './periods';
import type { GscPropertyType, ReportDataset } from './report-data';
import type { AiAnalysis, AiAnalysisMeta, PriorityLevel } from './schemas/ai-analysis';
import type { MarketStatus } from './schemas/market';
import type { ReportStage, ReportStatus } from './schemas/report';
import type { TemplateConfig } from './schemas/template';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Acceso
// ---------------------------------------------------------------------------

export interface AccessStatusDTO {
  unlocked: boolean;
  expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Google / integraciones
// ---------------------------------------------------------------------------

export type GoogleConnectionStatus = 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR' | 'DISCONNECTED';

export interface GooglePropertyDTO {
  id: string;
  siteUrl: string;
  displayName: string;
  propertyType: GscPropertyType;
  permissionLevel: string;
  isAccessible: boolean;
  lastSyncedAt: string | null;
  lastVerifiedAt: string | null;
  marketsCount: number;
}

export interface GoogleIntegrationStatusDTO {
  /** Client ID / Secret / Redirect URI configurados en el entorno. */
  configured: boolean;
  missingConfig: string[];
  connected: boolean;
  status: GoogleConnectionStatus;
  email: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastRefreshedAt: string | null;
  tokenExpiresAt: string | null;
  lastError: string | null;
  propertiesCount: number;
  redirectUri: string | null;
}

export interface AnthropicIntegrationStatusDTO {
  configured: boolean;
  model: string;
  effort: string;
  fallbackEnabled: boolean;
}

export interface IntegrationsStatusDTO {
  google: GoogleIntegrationStatusDTO;
  anthropic: AnthropicIntegrationStatusDTO;
  pdf: { engine: 'playwright-chromium'; available: boolean | null };
  database: { ok: boolean };
}

export interface GoogleConnectResponse {
  authorizationUrl: string;
}

export interface PropertyVerificationDTO {
  siteUrl: string;
  accessible: boolean;
  permissionLevel: string | null;
  message: string;
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

export interface TemplateSummaryDTO {
  id: string;
  name: string;
}

export interface TemplateDTO {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isSystem: boolean;
  config: TemplateConfig;
  marketsCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

export interface MarketDTO {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  status: MarketStatus;
  gscSiteUrl: string | null;
  googleProperty: GooglePropertyDTO | null;
  /** La propiedad configurada está en la lista sincronizada de la cuenta conectada. */
  propertyLinked: boolean;
  templateId: string | null;
  template: TemplateSummaryDTO | null;
  reportsCount: number;
  lastReportAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FreshnessDTO {
  today: IsoDate;
  timezone: string;
  latestAvailableDate: IsoDate;
  earliestAvailableDate: IsoDate;
  firstIncompleteDate: IsoDate | null;
  source: 'gsc_metadata' | 'estimated';
}

/** Datos de rendimiento en vivo para un market (mismo formato que el dataset del reporte). */
export type PerformanceDTO = ReportDataset;

// ---------------------------------------------------------------------------
// Reportes
// ---------------------------------------------------------------------------

export interface ReportMarketSummaryDTO {
  id: string;
  name: string;
  domain: string;
  logoUrl: string | null;
  primaryColor: string;
}

export interface ReportDTO {
  id: string;
  market: ReportMarketSummaryDTO;
  template: TemplateSummaryDTO | null;
  periodPreset: PeriodPreset;
  startDate: IsoDate;
  endDate: IsoDate;
  compareStartDate: IsoDate;
  compareEndDate: IsoDate;
  status: ReportStatus;
  stage: ReportStage;
  /** Etapas completadas con su duración en ms. */
  stageTimings: Partial<Record<ReportStage, number>>;
  errorCode: string | null;
  errorMessage: string | null;
  fileName: string | null;
  fileSize: number | null;
  includeAi: boolean;
  aiModel: string | null;
  downloadUrl: string | null;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ReportMetricDTO {
  metric: MetricKey;
  currentValue: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
}

export interface ReportRecommendationDTO {
  id: string;
  priority: PriorityLevel;
  title: string;
  problem: string;
  evidence: string;
  potentialImpact: string;
  action: string;
  justification: string;
  relatedQueries: string[];
  relatedPages: string[];
}

export interface GenerationMetaDTO {
  stageTimings: Partial<Record<ReportStage, number>>;
  gscRequests: number;
  rowsFetched: number;
  ai: AiAnalysisMeta | null;
  pdf: { pages: number; bytes: number; durationMs: number } | null;
  warnings: string[];
}

export interface ReportDetailDTO extends ReportDTO {
  metrics: ReportMetricDTO[];
  recommendations: ReportRecommendationDTO[];
  analysis: AiAnalysis | null;
  dataset: ReportDataset | null;
  generationMeta: GenerationMetaDTO | null;
}

export interface GenerateReportResponse {
  report: ReportDTO;
  /** true si ya existía un reporte idéntico en curso y se devolvió ese. */
  deduplicated: boolean;
}

// ---------------------------------------------------------------------------
// Settings / overview
// ---------------------------------------------------------------------------

export interface SettingsDTO {
  companyName: string;
  timezone: string;
  defaultPeriodPreset: Exclude<PeriodPreset, 'CUSTOM'>;
  dataDelayDays: number;
  defaultTemplateId: string | null;
  globalLogoUrl: string | null;
  globalLogoSource: 'upload' | 'env' | null;
  updatedAt: string;
}

export interface OverviewDTO {
  markets: { total: number; active: number; withProperty: number };
  reports: { total: number; completedThisMonth: number; running: number; failedLast7Days: number };
  recentReports: ReportDTO[];
  integrations: IntegrationsStatusDTO;
}
