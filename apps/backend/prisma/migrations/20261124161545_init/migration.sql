-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('DOMAIN', 'URL_PREFIX');

-- CreateEnum
CREATE TYPE "PeriodPreset" AS ENUM ('LAST_7_DAYS', 'LAST_14_DAYS', 'LAST_28_DAYS', 'LAST_30_DAYS', 'LAST_3_MONTHS', 'LAST_6_MONTHS', 'LAST_12_MONTHS', 'PREVIOUS_WEEK', 'PREVIOUS_MONTH', 'CURRENT_MONTH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReportStage" AS ENUM ('QUEUED', 'FETCHING_DATA', 'PROCESSING_METRICS', 'COMPARING_PERIODS', 'GENERATING_INSIGHTS', 'RENDERING_PDF', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MetricKey" AS ENUM ('CLICKS', 'IMPRESSIONS', 'CTR', 'POSITION');

-- CreateEnum
CREATE TYPE "InsightSection" AS ENUM ('EXECUTIVE_SUMMARY', 'PERFORMANCE_ANALYSIS', 'KEYWORD_ANALYSIS', 'PAGE_ANALYSIS', 'CTR_OPPORTUNITIES', 'OPPORTUNITIES', 'CONCLUSIONS', 'DATA_LIMITATIONS');

-- CreateEnum
CREATE TYPE "RecommendationPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "companyName" VARCHAR(80) NOT NULL DEFAULT 'Codario Labs',
    "globalLogoPath" VARCHAR(255),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Bogota',
    "defaultPeriodPreset" "PeriodPreset" NOT NULL DEFAULT 'LAST_28_DAYS',
    "dataDelayDays" INTEGER NOT NULL DEFAULT 3,
    "defaultTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_connections" (
    "id" TEXT NOT NULL,
    "googleAccountId" VARCHAR(64) NOT NULL,
    "email" VARCHAR(320),
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "status" "ConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastError" VARCHAR(500),
    "lastRefreshedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_properties" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "siteUrl" VARCHAR(2048) NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "permissionLevel" VARCHAR(40) NOT NULL,
    "isAccessible" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_states" (
    "id" TEXT NOT NULL,
    "stateHash" VARCHAR(64) NOT NULL,
    "codeVerifierEnc" TEXT NOT NULL,
    "sessionId" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "primaryColor" CHAR(7) NOT NULL,
    "secondaryColor" CHAR(7) NOT NULL,
    "backgroundColor" CHAR(7) NOT NULL,
    "textColor" CHAR(7) NOT NULL,
    "useMarketColors" BOOLEAN NOT NULL DEFAULT true,
    "headingFont" VARCHAR(40) NOT NULL,
    "bodyFont" VARCHAR(40) NOT NULL,
    "baseFontSize" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "layout" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "domain" VARCHAR(253) NOT NULL,
    "description" VARCHAR(500),
    "logoPath" VARCHAR(255),
    "primaryColor" CHAR(7) NOT NULL,
    "secondaryColor" CHAR(7) NOT NULL,
    "status" "MarketStatus" NOT NULL DEFAULT 'ACTIVE',
    "gscSiteUrl" VARCHAR(2048),
    "googlePropertyId" TEXT,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateSnapshot" JSONB,
    "templateName" VARCHAR(80),
    "periodPreset" "PeriodPreset" NOT NULL,
    "requestedStart" DATE,
    "requestedEnd" DATE,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "compareStartDate" DATE NOT NULL,
    "compareEndDate" DATE NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" "ReportStage" NOT NULL DEFAULT 'QUEUED',
    "includeAi" BOOLEAN NOT NULL DEFAULT true,
    "aiModel" VARCHAR(80),
    "errorCode" VARCHAR(64),
    "errorMessage" VARCHAR(1000),
    "fileName" VARCHAR(255),
    "filePath" VARCHAR(255),
    "fileSize" INTEGER,
    "metricsData" JSONB,
    "aiAnalysis" JSONB,
    "generationMeta" JSONB,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_metrics" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "metric" "MetricKey" NOT NULL,
    "currentValue" DOUBLE PRECISION,
    "previousValue" DOUBLE PRECISION,
    "absoluteChange" DOUBLE PRECISION,
    "percentChange" DOUBLE PRECISION,

    CONSTRAINT "report_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_insights" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "section" "InsightSection" NOT NULL,
    "content" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "report_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_recommendations" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "priority" "RecommendationPriority" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "problem" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "potentialImpact" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "relatedQueries" TEXT[],
    "relatedPages" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "report_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_connections_googleAccountId_key" ON "google_connections"("googleAccountId");

-- CreateIndex
CREATE INDEX "google_properties_siteUrl_idx" ON "google_properties"("siteUrl");

-- CreateIndex
CREATE UNIQUE INDEX "google_properties_connectionId_siteUrl_key" ON "google_properties"("connectionId", "siteUrl");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_stateHash_key" ON "oauth_states"("stateHash");

-- CreateIndex
CREATE INDEX "oauth_states_expiresAt_idx" ON "oauth_states"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "templates_name_key" ON "templates"("name");

-- CreateIndex
CREATE INDEX "templates_isDefault_idx" ON "templates"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "markets_domain_key" ON "markets"("domain");

-- CreateIndex
CREATE INDEX "markets_status_idx" ON "markets"("status");

-- CreateIndex
CREATE INDEX "markets_googlePropertyId_idx" ON "markets"("googlePropertyId");

-- CreateIndex
CREATE INDEX "markets_templateId_idx" ON "markets"("templateId");

-- CreateIndex
CREATE INDEX "reports_marketId_createdAt_idx" ON "reports"("marketId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_createdAt_idx" ON "reports"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "report_metrics_reportId_metric_key" ON "report_metrics"("reportId", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "report_insights_reportId_section_key" ON "report_insights"("reportId", "section");

-- CreateIndex
CREATE INDEX "report_recommendations_reportId_priority_idx" ON "report_recommendations"("reportId", "priority");

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_defaultTemplateId_fkey" FOREIGN KEY ("defaultTemplateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_properties" ADD CONSTRAINT "google_properties_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "google_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_googlePropertyId_fkey" FOREIGN KEY ("googlePropertyId") REFERENCES "google_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "markets" ADD CONSTRAINT "markets_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_metrics" ADD CONSTRAINT "report_metrics_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_insights" ADD CONSTRAINT "report_insights_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_recommendations" ADD CONSTRAINT "report_recommendations_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
