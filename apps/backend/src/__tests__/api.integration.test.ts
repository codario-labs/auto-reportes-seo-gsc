import { addDays, DEFAULT_TEMPLATE_CONFIG, todayInTimeZone, type ReportDTO } from '@codario/shared';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createApp } from '../app';
import { parseEnv } from '../config/env';
import { createContainer, type Container } from '../container';
import { createPrismaClient } from '../lib/prisma';
import { AnthropicService } from '../modules/ai/anthropic.service';
import { configToColumns, SYSTEM_TEMPLATE_NAME } from '../modules/templates/templates.service';
import { createFakeAnthropic, partAwareResponder, sampleAnalysis } from '../test/fake-anthropic';
import { createFakeGoogle, type FakeGoogle } from '../test/fake-google';

const databaseUrl = inject('testDatabaseUrl');
const ORIGIN = 'http://localhost:8080';
const ACCESS_KEY = 'integration-access-key';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function waitForReport(agent: request.Agent, id: string, timeoutMs = 60_000): Promise<ReportDTO> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await agent.get(`/api/reports/${id}/status`);
    const report = res.body as ReportDTO;
    if (!['QUEUED', 'RUNNING'].includes(report.status)) return report;
    if (Date.now() > deadline) throw new Error(`Report ${id} did not finish (stage ${report.stage})`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

describe.skipIf(!databaseUrl)('API integration (PostgreSQL + Chromium, simulated Google/Anthropic)', () => {
  let prisma: PrismaClient;
  let container: Container;
  let app: Express;
  let agent: request.Agent;
  let google: FakeGoogle;
  let storageDir: string;
  let marketId: string;
  let anthropicCalls: Array<{ params: Record<string, unknown> }>;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl!);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE report_recommendations, report_insights, report_metrics, reports, markets, google_properties, google_connections, oauth_states, app_settings, templates RESTART IDENTITY CASCADE',
    );
    const template = await prisma.template.create({
      data: { name: SYSTEM_TEMPLATE_NAME, isSystem: true, isDefault: true, ...configToColumns(DEFAULT_TEMPLATE_CONFIG) },
    });
    await prisma.appSettings.create({ data: { id: 1, timezone: 'America/Bogota', defaultTemplateId: template.id } });

    storageDir = mkdtempSync(path.join(os.tmpdir(), 'codario-test-'));
    const env = parseEnv({
      NODE_ENV: 'test',
      APP_URL: ORIGIN,
      CORS_ORIGINS: ORIGIN,
      APP_ACCESS_KEY: ACCESS_KEY,
      SESSION_SECRET: 's'.repeat(48),
      DATABASE_URL: databaseUrl!,
      TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
      GOOGLE_OAUTH_REDIRECT_URI: `${ORIGIN}/api/integrations/google/callback`,
      ANTHROPIC_API_KEY: 'test-key',
      STORAGE_DIR: storageDir,
      GSC_MAX_ROWS_PER_DIMENSION: '1000',
      LOG_LEVEL: 'silent',
    });
    const logger = pino({ level: 'silent' });
    google = createFakeGoogle({ firstIncompleteDate: addDays(todayInTimeZone('America/Bogota'), -2) });
    const fakeAnthropic = createFakeAnthropic(partAwareResponder(sampleAnalysis()));
    anthropicCalls = fakeAnthropic.calls;
    const anthropic = new AnthropicService(
      { apiKey: 'test-key', model: 'claude-opus-5-5', effort: 'high', maxOutputTokens: 64_000, timeoutMs: 60_000, maxRetries: 0, enableFallback: true },
      logger,
      fakeAnthropic.client,
    );
    container = createContainer(env, prisma, logger, { fetchImpl: google.fetch, anthropic });
    await container.storage.init();
    app = createApp(container);
    agent = request.agent(app);
  });

  afterAll(async () => {
    await container?.queue.stop();
    await container?.renderer.close();
    await prisma?.$disconnect();
    if (storageDir) rmSync(storageDir, { recursive: true, force: true });
  });

  it('reports health without authentication', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: true });
  });

  it('protects the panel with the access key (no users, no login)', async () => {
    expect((await request(app).get('/api/overview')).body.error.code).toBe('ACCESS_REQUIRED');
    const wrong = await agent.post('/api/access/unlock').set('Origin', ORIGIN).send({ accessKey: 'nope' });
    expect(wrong.status).toBe(401);
    const noOrigin = await agent.post('/api/access/unlock').send({ accessKey: ACCESS_KEY });
    expect(noOrigin.status).toBe(403);
    const ok = await agent.post('/api/access/unlock').set('Origin', ORIGIN).send({ accessKey: ACCESS_KEY });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
    expect((await agent.get('/api/access/status')).body.unlocked).toBe(true);
  });

  it('rejects state-changing requests from other origins (CSRF)', async () => {
    const res = await agent.post('/api/markets').set('Origin', 'https://evil.example').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('manages settings and the global Codario Labs logo', async () => {
    const invalid = await agent.put('/api/settings').set('Origin', ORIGIN).send({ timezone: 'Mars/Base' });
    expect(invalid.status).toBe(400);
    const updated = await agent.put('/api/settings').set('Origin', ORIGIN).send({ dataDelayDays: 2, companyName: 'Codario Labs' });
    expect(updated.body.dataDelayDays).toBe(2);
    const upload = await agent.post('/api/settings/logo').set('Origin', ORIGIN).attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(upload.status).toBe(200);
    expect(upload.body.globalLogoSource).toBe('upload');
    const logo = await agent.get('/api/files/branding/logo');
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.headers['x-content-type-options']).toBe('nosniff');
    const fake = await agent.post('/api/settings/logo').set('Origin', ORIGIN).attach('file', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(415);
  });

  it('manages templates and protects the system template', async () => {
    const list = await agent.get('/api/templates');
    const system = list.body.find((t: { isSystem: boolean }) => t.isSystem);
    expect(system.name).toBe(SYSTEM_TEMPLATE_NAME);
    const del = await agent.delete(`/api/templates/${system.id}`).set('Origin', ORIGIN);
    expect(del.status).toBe(409);
    const created = await agent
      .post('/api/templates')
      .set('Origin', ORIGIN)
      .send({ name: 'Minimal teal', config: { ...DEFAULT_TEMPLATE_CONFIG, cover: { ...DEFAULT_TEMPLATE_CONFIG.cover, style: 'minimal' } } });
    expect(created.status).toBe(201);
    const dup = await agent.post(`/api/templates/${created.body.id}/duplicate`).set('Origin', ORIGIN);
    expect(dup.body.name).toBe('Minimal teal (copy)');
    const reset = await agent.post(`/api/templates/${created.body.id}/reset`).set('Origin', ORIGIN);
    expect(reset.body.config.cover.style).toBe('editorial');
    const invalid = await agent.post('/api/templates').set('Origin', ORIGIN).send({ name: 'x', config: {} });
    expect(invalid.status).toBe(400);
    expect((await agent.delete(`/api/templates/${dup.body.id}`).set('Origin', ORIGIN)).status).toBe(204);
    const preview = await agent.post('/api/templates/preview').set('Origin', ORIGIN).send({ config: DEFAULT_TEMPLATE_CONFIG });
    expect(preview.headers['content-type']).toMatch(/text\/html/);
    expect(preview.text).toContain('Vista previa de estilo');
  });

  it('creates and validates markets', async () => {
    const invalid = await agent.post('/api/markets').set('Origin', ORIGIN).send({ name: 'X', domain: 'bad', primaryColor: 'blue', secondaryColor: '#000000' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details.map((d: { path: string }) => d.path)).toEqual(expect.arrayContaining(['domain', 'primaryColor']));
    const created = await agent.post('/api/markets').set('Origin', ORIGIN).send({
      name: 'Codario Labs',
      domain: 'https://www.codariolabs.com/',
      primaryColor: '#1e3a8a',
      secondaryColor: '#0ea5a4',
      gscSiteUrl: 'sc-domain:codariolabs.com',
    });
    expect(created.status).toBe(201);
    expect(created.body.domain).toBe('www.codariolabs.com');
    expect(created.body.propertyLinked).toBe(false); // aún no hay Google conectado
    marketId = created.body.id;
    const dup = await agent.post('/api/markets').set('Origin', ORIGIN).send({ name: 'Other', domain: 'www.codariolabs.com', primaryColor: '#000000', secondaryColor: '#000000' });
    expect(dup.status).toBe(409);
    const logo = await agent.post(`/api/markets/${marketId}/logo`).set('Origin', ORIGIN).attach('file', PNG, { filename: 'm.png', contentType: 'image/png' });
    expect(logo.body.logoUrl).toMatch(/^\/api\/files\/logos\//);
    const perf = await agent.get(`/api/markets/${marketId}/performance`);
    expect(perf.status).toBe(412);
    expect(perf.body.error.code).toBe('GOOGLE_NOT_CONNECTED');
  });

  it('connects Google with OAuth (state + PKCE), encrypts tokens and syncs properties', async () => {
    const connect = await agent.post('/api/integrations/google/connect').set('Origin', ORIGIN);
    const url = new URL(connect.body.authorizationUrl as string);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toContain('webmasters.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const state = url.searchParams.get('state')!;

    const forged = await agent.get('/api/integrations/google/callback').query({ code: 'abc', state: 'forged-state' });
    expect(forged.headers.location).toContain('google=error');
    expect(forged.headers.location).toContain('reason=invalid_state');

    // Un navegador distinto (sin la sesión que inició el flujo) no puede completar el callback.
    const otherBrowser = await request(app).get('/api/integrations/google/callback').query({ code: 'abc', state });
    expect(otherBrowser.headers.location).toContain('reason=session_mismatch');

    // El state es de un solo uso: hay que iniciar un flujo nuevo.
    const again = await agent.post('/api/integrations/google/connect').set('Origin', ORIGIN);
    const state2 = new URL(again.body.authorizationUrl as string).searchParams.get('state')!;
    const callback = await agent.get('/api/integrations/google/callback').query({ code: 'good-code', state: state2 });
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe(`${ORIGIN}/integrations?google=connected`);
    const replay = await agent.get('/api/integrations/google/callback').query({ code: 'good-code', state: state2 });
    expect(replay.headers.location).toContain('reason=invalid_state');

    const connection = await prisma.googleConnection.findFirstOrThrow();
    expect(connection.email).toBe('seo@codariolabs.com');
    expect(connection.accessTokenEnc).not.toContain('access-');
    expect(connection.refreshTokenEnc).not.toContain('refresh-secret-token');

    const status = await agent.get('/api/integrations/status');
    expect(status.body.google).toMatchObject({ configured: true, connected: true, status: 'CONNECTED', propertiesCount: 1 });
    const market = await agent.get(`/api/markets/${marketId}`);
    expect(market.body.propertyLinked).toBe(true);
    expect(market.body.googleProperty.propertyType).toBe('DOMAIN');
    const verify = await agent.post('/api/integrations/google/properties/verify').set('Origin', ORIGIN).send({ siteUrl: 'sc-domain:codariolabs.com' });
    expect(verify.body.accessible).toBe(true);
  });

  it('serves live Search Console performance and refreshes expired tokens automatically', async () => {
    const freshness = await agent.get(`/api/markets/${marketId}/freshness`);
    expect(freshness.body.source).toBe('gsc_metadata');
    await prisma.googleConnection.updateMany({ data: { tokenExpiresAt: new Date(Date.now() - 60_000) } });
    const before = google.tokenCounter.refresh;
    const perf = await agent.get(`/api/markets/${marketId}/performance`).query({ preset: 'LAST_28_DAYS', refresh: 'true' });
    expect(perf.status).toBe(200);
    expect(google.tokenCounter.refresh).toBe(before + 1);
    expect(perf.body.timeseries.current).toHaveLength(28);
    expect(perf.body.dataQuality.hasData).toBe(true);
    expect(perf.body.period.current.endDate).toBe(freshness.body.latestAvailableDate);
    const bad = await agent.get(`/api/markets/${marketId}/performance`).query({ preset: 'CUSTOM', startDate: '2020-01-01', endDate: '2020-02-01' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('PERIOD_UNAVAILABLE');
  });

  it('generates a complete report with AI insights and a real PDF', async () => {
    const res = await agent.post('/api/reports').set('Origin', ORIGIN).send({ marketId, periodPreset: 'LAST_28_DAYS', includeAi: true });
    expect(res.status).toBe(202);
    expect(res.body.deduplicated).toBe(false);
    const duplicate = await agent.post('/api/reports').set('Origin', ORIGIN).send({ marketId, periodPreset: 'LAST_28_DAYS', includeAi: true });
    expect(duplicate.body.deduplicated).toBe(true);
    expect(duplicate.body.report.id).toBe(res.body.report.id);

    const finished = await waitForReport(agent, res.body.report.id);
    expect(finished.errorMessage).toBeNull();
    expect(finished.status).toBe('COMPLETED');
    expect(Object.keys(finished.stageTimings)).toEqual(
      expect.arrayContaining(['FETCHING_DATA', 'PROCESSING_METRICS', 'COMPARING_PERIODS', 'GENERATING_INSIGHTS', 'RENDERING_PDF']),
    );
    expect(finished.downloadUrl).toBe(`/api/reports/${finished.id}/download`);

    const detail = await agent.get(`/api/reports/${finished.id}`);
    expect(detail.body.metrics).toHaveLength(4);
    expect(detail.body.recommendations[0].priority).toBe('high');
    expect(detail.body.analysis.executiveSummary.headline).toBeTruthy();
    expect(detail.body.dataset.queries.top.length).toBeGreaterThan(0);
    expect(detail.body.generationMeta.ai.groundingWarnings.length).toBeGreaterThan(0);
    expect(detail.body.generationMeta.pdf.pages).toBeGreaterThanOrEqual(8);
    expect(await prisma.reportInsight.count({ where: { reportId: finished.id } })).toBe(8);
    // Datos enviados a la IA: dataset compacto, nunca la API key ni tokens.
    const userContent = JSON.stringify(anthropicCalls[0]!.params.messages);
    expect(userContent).toContain('posicionamiento web');
    expect(userContent).not.toContain('test-key');

    const pdf = await agent.get(`/api/reports/${finished.id}/download`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toMatch(/attachment; filename="seo-report-Codario-Labs-/);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // La vista previa de plantilla con un market usa los datos reales de su último reporte.
    const preview = await agent.post('/api/templates/preview').set('Origin', ORIGIN).send({ config: DEFAULT_TEMPLATE_CONFIG, marketId });
    expect(preview.status).toBe(200);
    expect(preview.text).toContain('Rendimiento de keywords');
    expect(preview.text).not.toContain('Vista previa de estilo');
  });

  it('generates reports without AI, supports cancel and retry, filters and deletes history', async () => {
    const noAi = await agent.post('/api/reports').set('Origin', ORIGIN).send({ marketId, periodPreset: 'PREVIOUS_MONTH', includeAi: false });
    const queued = await agent.post('/api/reports').set('Origin', ORIGIN).send({ marketId, periodPreset: 'LAST_7_DAYS', includeAi: false });
    const cancelled = await agent.post(`/api/reports/${queued.body.report.id}/cancel`).set('Origin', ORIGIN);
    expect(['CANCELLED', 'RUNNING']).toContain(cancelled.body.status);
    const done = await waitForReport(agent, noAi.body.report.id);
    expect(done.status).toBe('COMPLETED');
    expect(done.stageTimings).not.toHaveProperty('GENERATING_INSIGHTS');
    expect((await agent.get(`/api/reports/${done.id}`)).body.analysis).toBeNull();
    const cancelledFinal = await waitForReport(agent, queued.body.report.id);
    expect(cancelledFinal.status).toBe('CANCELLED');

    const retry = await agent.post(`/api/reports/${cancelledFinal.id}/retry`).set('Origin', ORIGIN);
    expect(retry.status).toBe(202);
    expect((await waitForReport(agent, retry.body.report.id)).status).toBe('COMPLETED');

    const list = await agent.get('/api/reports').query({ marketId, status: 'COMPLETED', pageSize: 2 });
    expect(list.body.total).toBe(3);
    expect(list.body.items).toHaveLength(2);
    const filePath = (await prisma.report.findUniqueOrThrow({ where: { id: done.id } })).filePath!;
    expect(await container.storage.exists(filePath)).toBe(true);
    expect((await agent.delete(`/api/reports/${done.id}`).set('Origin', ORIGIN)).status).toBe(204);
    expect(await container.storage.exists(filePath)).toBe(false);
    expect((await agent.get(`/api/reports/${done.id}`)).status).toBe(404);
  });

  it('shows the overview and handles disconnecting Google and deleting markets', async () => {
    const overview = await agent.get('/api/overview');
    expect(overview.body.markets.total).toBe(1);
    expect(overview.body.reports.completedThisMonth).toBeGreaterThanOrEqual(1);
    expect(overview.body.integrations.anthropic.configured).toBe(true);

    const disconnected = await agent.post('/api/integrations/google/disconnect').set('Origin', ORIGIN);
    expect(disconnected.body.google.connected).toBe(false);
    expect(google.calls.some((c) => c.url === 'https://oauth2.googleapis.com/revoke')).toBe(true);
    const market = await agent.get(`/api/markets/${marketId}`);
    expect(market.body.gscSiteUrl).toBe('sc-domain:codariolabs.com');
    expect(market.body.propertyLinked).toBe(false);
    const gen = await agent.post('/api/reports').set('Origin', ORIGIN).send({ marketId, periodPreset: 'LAST_28_DAYS', includeAi: false });
    expect(gen.body.error.code).toBe('GOOGLE_NOT_CONNECTED');

    expect((await agent.delete(`/api/markets/${marketId}`).set('Origin', ORIGIN)).status).toBe(204);
    expect(await prisma.report.count({ where: { marketId } })).toBe(0);
  });
});
