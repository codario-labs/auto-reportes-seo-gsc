import { PeriodResolutionError, type ApiErrorBody } from '@codario/shared';
import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError, Errors } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { MAX_LOGO_BYTES } from '../lib/uploads';
import { zodIssues } from '../lib/validation';

function toAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return Errors.validation(zodIssues(error));
  if (error instanceof PeriodResolutionError) return Errors.periodUnavailable(error.message, error.code);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return Errors.fileTooLarge(MAX_LOGO_BYTES);
    return Errors.validation([{ path: error.field ?? 'file', message: error.message }], 'Invalid upload.');
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[] | string | undefined) ?? 'field';
      const fields = Array.isArray(target) ? target.join(', ') : target;
      return new AppError(409, 'CONFLICT', `A record with the same ${fields} already exists.`, {
        details: { fields: Array.isArray(target) ? target : [target] },
      });
    }
    if (error.code === 'P2025') return Errors.notFound('Record');
    if (error.code === 'P2003') return Errors.conflict('The operation conflicts with related records.');
  }
  const bodyError = error as { type?: string; status?: number };
  if (bodyError?.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
  if (bodyError?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }
  return null;
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);
    const requestId = String(req.id ?? '');
    const appError = toAppError(error);
    if (appError) {
      if (appError.status >= 500) {
        logger.warn({ err: error, requestId, code: appError.code }, 'request failed');
      }
      const body: ApiErrorBody = {
        error: {
          code: appError.code,
          message: appError.message,
          ...(appError.details !== undefined ? { details: appError.details } : {}),
          requestId,
        },
      };
      res.status(appError.status).json(body);
      return;
    }
    logger.error({ err: error, requestId, path: req.path }, 'unhandled error');
    const body: ApiErrorBody = {
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId },
    };
    res.status(500).json(body);
  };
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found.'));
};
