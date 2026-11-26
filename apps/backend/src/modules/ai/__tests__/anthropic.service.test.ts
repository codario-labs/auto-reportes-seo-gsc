import Anthropic from '@anthropic-ai/sdk';
import { resolvePeriod, type ReportDataset } from '@codario/shared';
import { pino } from 'pino';
import { beforeAll, describe, expect, it } from 'vitest';
import { createFakeAnthropic, fakeMessage, sampleAnalysis } from '../../../test/fake-anthropic';
import { createFakeGoogle } from '../../../test/fake-google';
import { buildDataset } from '../../analytics/dataset.builder';
import { SearchConsoleClient } from '../../gsc/gsc.client';
import { AnthropicService } from '../anthropic.service';
import { enforceGrounding } from '../grounding';
import { buildAnalysisPayload } from '../payload';

const logger = pino({ level: 'silent' });
const config = {
  apiKey: 'test-key',
  model: 'claude-opus-5-5',
  effort: 'high' as const,
  maxOutputTokens: 64_000,
  timeoutMs: 60_000,
  maxRetries: 0,
  enableFallback: true,
};
const context = { marketName: 'Codario Labs', domain: 'codariolabs.com', description: null };

let dataset: ReportDataset;

beforeAll(async () => {
  const google = createFakeGoogle({ firstIncompleteDate: '2026-11-22' });
  dataset = await buildDataset({
    client: new SearchConsoleClient(async () => 't', { fetchImpl: google.fetch }),
    siteUrl: 'sc-domain:codariolabs.com',
    period: resolvePeriod('LAST_28_DAYS', { today: '2026-11-24', latestAvailableDate: '2026-11-21' }),
    freshness: { latestAvailableDate: '2026-11-21', source: 'gsc_metadata', firstIncompleteDate: '2026-11-22', dataState: 'final', checkedAt: '' },
    maxRowsPerDimension: 1000,
  });
});

describe('buildAnalysisPayload', () => {
  it('produces a compact payload with every referenced key tracked', () => {
    const { payload, knownQueries, knownPages } = buildAnalysisPayload(dataset, context);
    const json = JSON.stringify(payload);
    expect(json.length).toBeLessThan(60_000);
    expect(knownQueries.has('posicionamiento web')).toBe(true);
    expect(knownPages.has('https://codariolabs.com/')).toBe(true);
    expect(json).toContain('"columnas"');
    expect(json).not.toContain('undefined');
  });
});

describe('enforceGrounding', () => {
  it('removes queries and pages that are not in the dataset', () => {
    const { analysis, warnings } = enforceGrounding(sampleAnalysis(), {
      queries: new Set(['posicionamiento web']),
      pages: new Set(['https://codariolabs.com/']),
    });
    expect(analysis.keywordAnalysis.findings[0]?.relatedQueries).toEqual(['posicionamiento web']);
    expect(analysis.ctrOpportunities.items).toHaveLength(1);
    expect(warnings).toHaveLength(2);
  });
});

describe('AnthropicService', () => {
  it('reports when it is not configured', async () => {
    const service = new AnthropicService({ ...config, apiKey: undefined }, logger);
    expect(service.isConfigured).toBe(false);
    await expect(service.analyze(dataset, context)).rejects.toMatchObject({ code: 'INTEGRATION_NOT_CONFIGURED' });
  });

  it('requests structured output with streaming, effort and server-side fallback', async () => {
    const fake = createFakeAnthropic([fakeMessage(JSON.stringify(sampleAnalysis()))]);
    const service = new AnthropicService(config, logger, fake.client);
    const result = await service.analyze(dataset, context);
    expect(result.analysis.executiveSummary.overallStatus).toBe('positive');
    expect(result.meta.inputTokens).toBe(4200);
    expect(result.meta.groundingWarnings.length).toBeGreaterThan(0);
    const params = fake.calls[0]!.params as {
      model: string;
      output_config: { effort: string; format: { type: string; schema: { type: string } } };
      betas: string[];
      fallbacks: string;
      system: string;
    };
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.output_config.effort).toBe('high');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.format.schema.type).toBe('object');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.fallbacks).toBe('default');
    expect(params.system).toContain('No tienes acceso al contenido de las páginas');
  });

  it('retries once when the response does not match the schema', async () => {
    const fake = createFakeAnthropic([fakeMessage('{"invalid": true}'), fakeMessage(JSON.stringify(sampleAnalysis()))]);
    const result = await new AnthropicService(config, logger, fake.client).analyze(dataset, context);
    expect(result.meta.attempts).toBe(2);
    expect(fake.calls).toHaveLength(2);
  });

  it('fails clearly after repeated invalid responses', async () => {
    const fake = createFakeAnthropic([fakeMessage('not json')]);
    await expect(new AnthropicService(config, logger, fake.client).analyze(dataset, context)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });
  });

  it('handles refusals and truncated output', async () => {
    const refused = createFakeAnthropic([fakeMessage('', { stop_reason: 'refusal' })]);
    await expect(new AnthropicService(config, logger, refused.client).analyze(dataset, context)).rejects.toMatchObject({ code: 'AI_REFUSED' });
    const truncated = createFakeAnthropic([fakeMessage('{"executive', { stop_reason: 'max_tokens' })]);
    await expect(new AnthropicService(config, logger, truncated.client).analyze(dataset, context)).rejects.toMatchObject({
      code: 'AI_OUTPUT_TRUNCATED',
    });
  });

  it('maps SDK errors to actionable messages', async () => {
    const authError = new Anthropic.AuthenticationError(401, { type: 'error' }, 'invalid x-api-key', new Headers());
    const fake = createFakeAnthropic([authError]);
    await expect(new AnthropicService(config, logger, fake.client).analyze(dataset, context)).rejects.toMatchObject({ code: 'AI_AUTH_FAILED' });
  });

  it('omits the fallback beta when disabled', async () => {
    const fake = createFakeAnthropic([fakeMessage(JSON.stringify(sampleAnalysis()))]);
    await new AnthropicService({ ...config, enableFallback: false }, logger, fake.client).analyze(dataset, context);
    expect(fake.calls[0]!.params).not.toHaveProperty('fallbacks');
  });
});
