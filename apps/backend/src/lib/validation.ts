import type { z } from 'zod';
import { Errors } from './errors';

export interface ValidationIssue {
  path: string;
  message: string;
}

export function zodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

/** Valida datos de entrada con un esquema Zod o lanza un VALIDATION_ERROR (400). */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw Errors.validation(zodIssues(result.error));
  return result.data;
}
