import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { aiAnalysisSchema, type AiAnalysis, type AiAnalysisMeta } from '@codario/shared';
import { AppError, Errors } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { enforceGrounding } from './grounding';
import { buildAnalysisPayload, type AnalysisContext } from './payload';
import { buildUserPrompt, SEO_ANALYST_SYSTEM_PROMPT } from './prompts';
import type { ReportDataset } from '@codario/shared';

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
/** Intentos ante respuestas JSON inválidas (además de los reintentos HTTP del SDK). */
const MAX_PARSE_ATTEMPTS = 2;

/** JSON Schema para las salidas estructuradas, derivado del esquema Zod compartido. */
const OUTPUT_SCHEMA = betaZodOutputFormat(aiAnalysisSchema).schema;

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

/**
 * Integración con la API de Anthropic. Solo se ejecuta en el backend; la API key nunca sale del servidor.
 * Usa streaming (respuestas largas sin timeouts HTTP), salidas estructuradas con JSON Schema,
 * validación Zod posterior, verificación de anclaje y reintentos controlados.
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
    const userPrompt = buildUserPrompt(JSON.stringify(payload));
    const started = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let lastIssue = '';

    for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt += 1) {
      const message = await this.request(userPrompt, options.signal);
      inputTokens += message.usage.input_tokens;
      outputTokens += message.usage.output_tokens;

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

      const parsed = this.parse(text);
      if (parsed.ok) {
        const grounded = enforceGrounding(parsed.value, { queries: knownQueries, pages: knownPages });
        if (grounded.warnings.length > 0) {
          this.logger.warn({ count: grounded.warnings.length }, 'AI analysis referenced items outside the dataset');
        }
        const fallbackUsed = (message.usage.iterations ?? []).some((entry) => entry.type === 'fallback_message');
        return {
          analysis: grounded.analysis,
          meta: {
            model: this.config.model,
            servedBy: message.model,
            fallbackUsed,
            inputTokens,
            outputTokens,
            durationMs: Date.now() - started,
            attempts: attempt,
            groundingWarnings: grounded.warnings,
            generatedAt: new Date().toISOString(),
          },
        };
      }
      lastIssue = parsed.error;
      this.logger.warn({ attempt, issue: parsed.error }, 'AI response failed validation');
    }
    throw new AiAnalysisError('AI_INVALID_RESPONSE', `The AI response did not match the expected structure (${lastIssue}).`);
  }

  private parse(text: string): { ok: true; value: AiAnalysis } | { ok: false; error: string } {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: 'invalid JSON' };
    }
    const result = aiAnalysisSchema.safeParse(json);
    if (!result.success) {
      const first = result.error.issues[0];
      return { ok: false, error: first ? `${first.path.join('.')}: ${first.message}` : 'schema mismatch' };
    }
    return { ok: true, value: result.data };
  }

  private async request(userPrompt: string, signal?: AbortSignal): Promise<Anthropic.Beta.BetaMessage> {
    const client = this.client!;
    try {
      const stream = client.beta.messages.stream(
        {
          model: this.config.model,
          max_tokens: this.config.maxOutputTokens,
          system: SEO_ANALYST_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          output_config: {
            effort: this.config.effort,
            format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
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
