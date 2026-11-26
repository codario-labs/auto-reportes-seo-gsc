/**
 * Errores de dominio con código estable y estado HTTP.
 * Solo los AppError exponen su mensaje al cliente; el resto se convierte en INTERNAL_ERROR.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  /** Mensaje seguro para el cliente. */
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, options?: { details?: unknown; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.expose = true;
  }
}

export const Errors = {
  validation: (details: unknown, message = 'The request contains invalid data.') =>
    new AppError(400, 'VALIDATION_ERROR', message, { details }),
  notFound: (entity: string) => new AppError(404, 'NOT_FOUND', `${entity} not found.`),
  conflict: (message: string, code = 'CONFLICT') => new AppError(409, code, message),
  accessRequired: () => new AppError(401, 'ACCESS_REQUIRED', 'Unlock the workspace to continue.'),
  invalidAccessKey: () => new AppError(401, 'INVALID_ACCESS_KEY', 'The access key is not valid.'),
  originNotAllowed: () => new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.'),
  googleNotConfigured: (missing: string[]) =>
    new AppError(
      503,
      'INTEGRATION_NOT_CONFIGURED',
      `Google OAuth is not configured. Missing: ${missing.join(', ')}.`,
      { details: { integration: 'google', missing } },
    ),
  anthropicNotConfigured: () =>
    new AppError(503, 'INTEGRATION_NOT_CONFIGURED', 'Anthropic is not configured. Set ANTHROPIC_API_KEY on the server.', {
      details: { integration: 'anthropic', missing: ['ANTHROPIC_API_KEY'] },
    }),
  googleNotConnected: (message = 'Connect a Google account with access to Search Console first.') =>
    new AppError(412, 'GOOGLE_NOT_CONNECTED', message),
  propertyMissing: () =>
    new AppError(409, 'MARKET_PROPERTY_MISSING', 'This market has no Search Console property assigned.'),
  propertyInaccessible: (siteUrl: string) =>
    new AppError(
      424,
      'GSC_PROPERTY_INACCESSIBLE',
      `The connected Google account cannot access the Search Console property ${siteUrl}.`,
    ),
  periodUnavailable: (message: string, code: string) =>
    new AppError(422, 'PERIOD_UNAVAILABLE', message, { details: { reason: code } }),
  gscApi: (message: string, details?: unknown) => new AppError(502, 'GSC_API_ERROR', message, { details }),
  fileTooLarge: (maxBytes: number) =>
    new AppError(413, 'FILE_TOO_LARGE', `The file exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`),
  unsupportedMedia: (message: string) => new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', message),
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
