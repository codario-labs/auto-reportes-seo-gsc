import Anthropic from '@anthropic-ai/sdk';
import { aiAnalysisSchema, resolvePeriod, type ReportDataset } from '@codario/shared';
import { pino } from 'pino';
import { beforeAll, describe, expect, it } from 'vitest';
import { createFakeAnthropic, fakeMessage, partAwareResponder, requestedKeys, sampleAnalysis } from '../../../test/fake-anthropic';
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

  it('splits the analysis into three structured requests that cover the whole schema', async () => {
    const fake = createFakeAnthropic(partAwareResponder(sampleAnalysis()));
    const service = new AnthropicService(config, logger, fake.client);
    const result = await service.analyze(dataset, context);
    expect(result.analysis.executiveSummary.overallStatus).toBe('positive');
    expect(result.analysis.recommendations).toHaveLength(1);
    expect(result.meta.requests).toBe(3);
    expect(result.meta.inputTokens).toBe(3 * 4200);
    expect(result.meta.groundingWarnings.length).toBeGreaterThan(0);

    expect(fake.calls).toHaveLength(3);
    const keysPerCall = fake.calls.map((c) => requestedKeys(c.params).sort());
    expect(keysPerCall[0]).toEqual(['dataLimitations', 'executiveSummary', 'performanceAnalysis']);
    expect(keysPerCall[1]).toEqual(['ctrOpportunities', 'keywordAnalysis', 'pageAnalysis']);
    expect(keysPerCall[2]).toEqual(['conclusions', 'opportunities', 'recommendations']);
    // Las tres partes cubren exactamente el esquema completo, sin solaparse.
    expect(keysPerCall.flat().sort()).toEqual(Object.keys(aiAnalysisSchema.shape).sort());

    type Params = {
      model: string;
      output_config: { effort: string; format: { type: string; schema: { type: string } } };
      betas: string[];
      fallbacks: string;
      system: string;
      messages: Array<{ content: Array<{ type: string; text: string }> }>;
    };
    const params = fake.calls.map((c) => c.params as unknown as Params);
    for (const p of params) {
      expect(p.model).toBe('claude-opus-5-5');
      expect(p.output_config.effort).toBe('high');
      expect(p.output_config.format.type).toBe('json_schema');
      expect(p.output_config.format.schema.type).toBe('object');
      expect(p.betas).toContain('server-side-fallback-2026-07-01');
      expect(p.fallbacks).toBe('default');
      expect(p.system).toContain('No tienes acceso al contenido de las páginas');
    }
    // Las tres partes analizan el mismo dataset.
    const datasetBlocks = params.map((p) => p.messages[0]!.content[0]!);
    expect(new Set(datasetBlocks.map((b) => b.text)).size).toBe(1);
    expect(datasetBlocks[0]!.text).toContain('<dataset_gsc>');
    // El plan de acción recibe el diagnóstico y los hallazgos.
    expect(params[2]!.messages[0]!.content[1]!.text).toContain('<analisis_previo>');
    expect(params[2]!.messages[0]!.content[1]!.text).toContain('Los clics crecieron');
    expect(params[0]!.messages[0]!.content[1]!.text).not.toContain('<analisis_previo>');
  });

  it('retries a part once when its response does not match the schema', async () => {
    const valid = partAwareResponder(sampleAnalysis());
    const fake = createFakeAnthropic((params, index) => (index === 0 ? fakeMessage('{"invalid": true}') : valid(params, index)));
    const result = await new AnthropicService(config, logger, fake.client).analyze(dataset, context);
    expect(result.meta.attempts).toBe(4);
    expect(fake.calls).toHaveLength(4);
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
    const fake = createFakeAnthropic(partAwareResponder(sampleAnalysis()));
    await new AnthropicService({ ...config, enableFallback: false }, logger, fake.client).analyze(dataset, context);
    expect(fake.calls[0]!.params).not.toHaveProperty('fallbacks');
  });
});
