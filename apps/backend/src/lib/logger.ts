import { pino, type Logger, type LoggerOptions } from 'pino';

/** Rutas que nunca deben aparecer en los logs. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'accessKey',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'code',
  'codeVerifier',
  'apiKey',
  '*.accessToken',
  '*.refreshToken',
  '*.access_token',
  '*.refresh_token',
  '*.apiKey',
];

export function createLogger(options: { level: string; pretty?: boolean }): Logger {
  const base: LoggerOptions = {
    level: options.level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { service: 'seo-report-backend' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
  if (options.pretty) {
    return pino({
      ...base,
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', singleLine: true } },
    });
  }
  return pino(base);
}

export type { Logger };
