import { isValidTimeZone } from '@codario/shared';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),

  APP_URL: z.url().default('http://localhost:8080'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:8080,http://localhost:5173')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
    ),
  APP_TIMEZONE: z
    .string()
    .default('America/Bogota')
    .refine((tz) => isValidTimeZone(tz), 'APP_TIMEZONE must be a valid IANA time zone'),

  APP_ACCESS_KEY: z.string().min(12, 'APP_ACCESS_KEY must have at least 12 characters'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must have at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().min(1).max(720).default(12),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  TOKEN_ENCRYPTION_KEY: z.string().refine((v) => {
    try {
      return Buffer.from(v, 'base64').length === 32;
    } catch {
      return false;
    }
  }, 'TOKEN_ENCRYPTION_KEY must be 32 bytes encoded in base64'),

  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString,
  GOOGLE_OAUTH_REDIRECT_URI: optionalString.pipe(z.url().optional()),
  GSC_MAX_ROWS_PER_DIMENSION: z.coerce.number().int().min(100).max(100_000).default(5000),

  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().trim().min(1).default('claude-opus-5-5'),
  ANTHROPIC_EFFORT: z.enum(EFFORT_LEVELS).default('high'),
  ANTHROPIC_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1024).max(128_000).default(64_000),
  ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(600_000),
  ANTHROPIC_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  ANTHROPIC_ENABLE_FALLBACK: booleanFromString.default(true),

  STORAGE_DIR: z.string().default('./storage'),
  CODARIO_LOGO_PATH: optionalString,

  REPORT_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  REPORT_JOB_TIMEOUT_MS: z.coerce.number().int().min(60_000).max(3_600_000).default(900_000),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example for documentation.`);
  }
  return result.data;
}

export function googleConfigStatus(env: Env): { configured: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!env.GOOGLE_OAUTH_CLIENT_ID) missing.push('GOOGLE_OAUTH_CLIENT_ID');
  if (!env.GOOGLE_OAUTH_CLIENT_SECRET) missing.push('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!env.GOOGLE_OAUTH_REDIRECT_URI) missing.push('GOOGLE_OAUTH_REDIRECT_URI');
  return { configured: missing.length === 0, missing };
}
