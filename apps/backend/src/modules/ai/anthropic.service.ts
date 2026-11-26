import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { aiAnalysisSchema, type AiAnalysis, type AiAnalysisMeta, type ReportDataset } from '@codario/shared';
import type { z } from 'zod';
import { AppError, Errors } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { ACTIONS_PART, DIAGNOSIS_PART, FINDINGS_PART, type AnalysisPart } from './analysis-parts';
import { enforceGrounding } from './grounding';
import { buildAnalysisPayload, type AnalysisContext } from './payload';
import { buildDatasetBlock, buildPartInstruction, SEO_ANALYST_SYSTEM_PROMPT } from './prompts';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AnthropicConfig {
  apiKey?: string;
  model: string;
  effort: EffortLevel;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
  enableFallback: boolean;
}

/** Beta de reintento del lado del servidor con un modelo alternativo cuando el modelo declina la petición. */
const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** Intentos por parte ante respuestas JSON inválidas (además de los reintentos HTTP del SDK). */
const MAX_PARSE_ATTEMPTS = 2;

/** JSON Schema (salidas estructuradas) de cada parte, derivado de los esquemas Zod compartidos. */
const PART_SCHEMAS = new Map(
  [DIAGNOSIS_PART, FINDINGS_PART, ACTIONS_PART].map((part) => [part.name, betaZodOutputFormat(part.schema).schema]),
);

export class AiAnalysisError extends AppError {
  constructor(code: string, message: string, status = 502) {
    super(status, code, message);
    this.name = 'AiAnalysisError';
  }
}

export interface AnalysisResult {
  analysis: AiAnalysis;
  meta: AiAnalysisMeta;
}

interface UsageTotals {
  requests: number;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  servedBy: Set<string>;
  fallbackUsed: boolean;
}

/**
 * Integración con la API de Anthropic. Solo se ejecuta en el backend; la API key nunca sale del servidor.
 *
 * El análisis se genera en tres partes con salidas estructuradas (JSON Schema), porque el esquema
 * completo supera el tamaño de gramática que admite la API:
 *  1. diagnóstico y 2. hallazgos, en paralelo;
 *  3. plan de acción, que recibe 1 y 2 para ser coherente con ellos.
 * Después se fusiona, se valida con el esquema completo y se verifica el anclaje a los datos.
 */
export class AnthropicService {
  private readonly client: Anthropic | null;

  constructor(
    private readonly config: AnthropicConfig,
    private readonly logger: Logger,
    client?: Anthropic,
  ) {
    this.client =
      client ??
      (config.apiKey
        ? new Anthropic({ apiKey: config.apiKey, maxRetries: config.maxRetries, timeout: config.timeoutMs })
        : null);
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  get model(): string {
    return this.config.model;
  }

  async analyze(dataset: ReportDataset, context: AnalysisContext, options: { signal?: AbortSignal } = {}): Promise<AnalysisResult> {
    if (!this.client) throw Errors.anthropicNotConfigured();
    const { payload, knownQueries, knownPages } = buildAnalysisPayload(dataset, context);
    const datasetBlock = buildDatasetBlock(JSON.stringify(payload));
    const started = Date.now();
    const usage: UsageTotals = {
      requests: 0,
      attempts: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      servedBy: new Set(),
      fallbackUsed: false,
    };

    // Si una parte falla, se cancelan las demás para no consumir tokens en vano.
    const siblings = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, siblings.signal]) : siblings.signal;
    const run = <S extends z.ZodType>(part: AnalysisPart & { schema: S }, previous?: string) =>
      this.runPart(part, datasetBlock, previous, signal, usage).catch((error: unknown) => {
        siblings.abort();
        throw error;
      });

    const [diagnosis, findings] = await Promise.all([run(DIAGNOSIS_PART), run(FINDINGS_PART)]);
    const actions = await run(ACTIONS_PART, JSON.stringify({ ...diagnosis, ...findings }));

    const merged = aiAnalysisSchema.safeParse({ ...diagnosis, ...findings, ...actions });
    if (!merged.success) {
      const first = merged.error.issues[0];
      throw new AiAnalysisError(
        'AI_INVALID_RESPONSE',
        `The AI response did not match the expected structure (${first ? `${first.path.join('.')}: ${first.message}` : 'schema mismatch'}).`,
      );
    }

    const grounded = enforceGrounding(merged.data, { queries: knownQueries, pages: knownPages });
    if (grounded.warnings.length > 0) {
      this.logger.warn({ count: grounded.warnings.length }, 'AI analysis referenced items outside the dataset');
    }
    this.logger.info(
      {
        requests: usage.requests,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        durationMs: Date.now() - started,
      },
      'AI analysis completed',
    );
    return {
      analysis: grounded.analysis,
      meta: {
        model: this.config.model,
        servedBy: [...usage.servedBy].join(', ') || this.config.model,
        fallbackUsed: usage.fallbackUsed,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        durationMs: Date.now() - started,
        attempts: usage.attempts,
        groundingWarnings: grounded.warnings,
        generatedAt: new Date().toISOString(),
        requests: usage.requests,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
      },
    };
  }

  /** Genera una parte del análisis y la valida con su esquema (1 reintento si no cumple). */
  private async runPart<S extends z.ZodType>(
    part: AnalysisPart & { schema: S },
    datasetBlock: string,
    previous: string | undefined,
    signal: AbortSignal,
    usage: UsageTotals,
  ): Promise<z.output<S>> {
    const instruction = buildPartInstruction(part.sections, part.focus, previous);
    let lastIssue = '';
    for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt += 1) {
      const message = await this.request(part, datasetBlock, instruction, signal);
      usage.requests += 1;
      usage.attempts += 1;
      usage.inputTokens += message.usage.input_tokens;
      usage.outputTokens += message.usage.output_tokens;
      usage.cacheReadInputTokens += message.usage.cache_read_input_tokens ?? 0;
      usage.cacheCreationInputTokens += message.usage.cache_creation_input_tokens ?? 0;
      usage.servedBy.add(message.model);
      if ((message.usage.iterations ?? []).some((entry) => entry.type === 'fallback_message')) usage.fallbackUsed = true;

      if (message.stop_reason === 'refusal') {
        throw new AiAnalysisError('AI_REFUSED', 'The AI model declined to analyze this data. Try again or generate the report without AI.');
      }
      if (message.stop_reason === 'max_tokens') {
        throw new AiAnalysisError(
          'AI_OUTPUT_TRUNCATED',
          'The AI response exceeded the output token limit. Increase ANTHROPIC_MAX_OUTPUT_TOKENS or lower ANTHROPIC_EFFORT.',
        );
      }

      const text = message.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
      const parsed = parseJson(part.schema, text);
      if (parsed.ok) return parsed.value;
      lastIssue = parsed.error;
      this.logger.warn({ part: part.name, attempt, issue: parsed.error }, 'AI response failed validation');
    }
    throw new AiAnalysisError('AI_INVALID_RESPONSE', `The AI response did not match the expected structure (${part.name}: ${lastIssue}).`);
  }

  private async request(part: AnalysisPart, datasetBlock: string, instruction: string, signal: AbortSignal): Promise<Anthropic.Beta.BetaMessage> {
    const client = this.client!;
    try {
      const stream = client.beta.messages.stream(
        {
          model: this.config.model,
          max_tokens: this.config.maxOutputTokens,
          system: SEO_ANALYST_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              // Sin cache_control: el esquema de salida forma parte del prefijo y es distinto en cada parte,
              // así que la caché nunca se reutilizaría y solo encarecería la escritura (medido con la API real).
              content: [
                { type: 'text', text: datasetBlock },
                { type: 'text', text: instruction },
              ],
            },
          ],
          output_config: {
            effort: this.config.effort,
            format: { type: 'json_schema', schema: PART_SCHEMAS.get(part.name)! },
          },
          ...(this.config.enableFallback ? { betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: 'default' as const } : {}),
        },
        { signal },
      );
      return await stream.finalMessage();
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): Error {
    if (error instanceof Anthropic.APIUserAbortError) {
      return new AiAnalysisError('CANCELLED', 'The AI analysis was cancelled.', 499);
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return new AiAnalysisError('AI_AUTH_FAILED', 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY on the server.');
    }
    if (error instanceof Anthropic.NotFoundError) {
      return new AiAnalysisError('AI_MODEL_NOT_FOUND', `The model "${this.config.model}" is not available. Check ANTHROPIC_MODEL.`);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new AiAnalysisError('AI_RATE_LIMITED', 'Anthropic rate limit reached. Try again in a few minutes.', 429);
    }
    if (error instanceof Anthropic.BadRequestError) {
      this.logger.error({ err: error }, 'anthropic bad request');
      return new AiAnalysisError('AI_BAD_REQUEST', `Anthropic rejected the request: ${error.message}`);
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return new AiAnalysisError('AI_TIMEOUT', 'The AI analysis timed out. Try again.', 504);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return new AiAnalysisError('AI_UNREACHABLE', 'Could not reach the Anthropic API.', 503);
    }
    if (error instanceof Anthropic.APIError) {
      return new AiAnalysisError('AI_API_ERROR', `Anthropic API error (${String(error.status)}). Try again later.`);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

function parseJson<S extends z.ZodType>(schema: S, text: string): { ok: true; value: z.output<S> } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, error: first ? `${first.path.join('.')}: ${first.message}` : 'schema mismatch' };
  }
  return { ok: true, value: result.data };
}
