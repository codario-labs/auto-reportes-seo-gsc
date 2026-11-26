/** Fixtures tipados SOLO para tests (nunca se usan en la aplicación). */
import {
  DEFAULT_TEMPLATE_CONFIG,
  type IntegrationsStatusDTO,
  type MarketDTO,
  type OverviewDTO,
  type ReportDTO,
  type SettingsDTO,
  type TemplateDTO,
} from '@codario/shared';

export const settingsFixture: SettingsDTO = {
  companyName: 'Codario Labs',
  timezone: 'America/Bogota',
  defaultPeriodPreset: 'LAST_28_DAYS',
  dataDelayDays: 3,
  defaultTemplateId: null,
  globalLogoUrl: null,
  globalLogoSource: null,
  updatedAt: '2026-11-20T10:00:00.000Z',
};

export const integrationsFixture: IntegrationsStatusDTO = {
  google: {
    configured: true,
    missingConfig: [],
    connected: false,
    status: 'DISCONNECTED',
    email: null,
    scopes: [],
    connectedAt: null,
    lastRefreshedAt: null,
    tokenExpiresAt: null,
    lastError: null,
    propertiesCount: 0,
    redirectUri: 'http://localhost:8080/api/integrations/google/callback',
  },
  anthropic: { configured: true, model: 'claude-opus-5-5', effort: 'high', fallbackEnabled: true },
  pdf: { engine: 'playwright-chromium', available: null },
  database: { ok: true },
};

export const templateFixture: TemplateDTO = {
  id: 'tpl_default',
  name: 'Codario Premium',
  description: 'Default template',
  isDefault: true,
  isSystem: true,
  config: DEFAULT_TEMPLATE_CONFIG,
  marketsCount: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

export const marketFixture: MarketDTO = {
  id: 'mkt_1',
  name: 'Codario Labs',
  domain: 'codariolabs.com',
  description: null,
  logoUrl: null,
  primaryColor: '#1E3A8A',
  secondaryColor: '#0EA5A4',
  status: 'ACTIVE',
  gscSiteUrl: 'sc-domain:codariolabs.com',
  googleProperty: null,
  propertyLinked: true,
  templateId: null,
  template: null,
  reportsCount: 0,
  lastReportAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

export function reportFixture(overrides: Partial<ReportDTO> = {}): ReportDTO {
  return {
    id: 'rep_1',
    market: { id: 'mkt_1', name: 'Codario Labs', domain: 'codariolabs.com', logoUrl: null, primaryColor: '#1E3A8A' },
    template: { id: 'tpl_default', name: 'Codario Premium' },
    periodPreset: 'LAST_28_DAYS',
    startDate: '2026-10-25',
    endDate: '2026-11-21',
    compareStartDate: '2026-09-27',
    compareEndDate: '2026-10-24',
    status: 'RUNNING',
    stage: 'COMPARING_PERIODS',
    stageTimings: { FETCHING_DATA: 4200, PROCESSING_METRICS: 310 },
    errorCode: null,
    errorMessage: null,
    fileName: null,
    fileSize: null,
    includeAi: true,
    aiModel: 'claude-opus-5-5',
    downloadUrl: null,
    requestedAt: '2026-11-24T10:00:00.000Z',
    startedAt: '2026-11-24T10:00:01.000Z',
    completedAt: null,
    ...overrides,
  };
}

export const overviewFixture: OverviewDTO = {
  markets: { total: 1, active: 1, withProperty: 1 },
  reports: { total: 0, completedThisMonth: 0, running: 0, failedLast7Days: 0 },
  recentReports: [],
  integrations: integrationsFixture,
};
