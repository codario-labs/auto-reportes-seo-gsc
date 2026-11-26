import type { ApiErrorBody } from '@codario/shared';

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Issues de validación (400 VALIDATION_ERROR) indexados por ruta de campo. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_ERROR' || !Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const item of this.details as ValidationIssue[]) {
      if (item && typeof item.path === 'string' && !(item.path in out)) out[item.path] = item.message;
    }
    return out;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

type AccessListener = () => void;
const accessListeners = new Set<AccessListener>();

/** Se dispara cuando la API responde 401 ACCESS_REQUIRED (la sesión del panel caducó). */
export function onAccessRequired(listener: AccessListener): () => void {
  accessListeners.add(listener);
  return () => {
    accessListeners.delete(listener);
  };
}

interface RequestOptions {
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  responseType?: 'json' | 'text';
}

export const API_BASE = '/api';

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: options.responseType === 'text' ? 'text/html, text/plain, */*' : 'application/json',
  };
  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check that the backend is running.');
  }

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as Partial<ApiErrorBody> | null;
    const error = new ApiError(
      response.status,
      parsed?.error?.code ?? `HTTP_${response.status}`,
      parsed?.error?.message ?? (response.statusText || 'The request failed.'),
      parsed?.error?.details,
      parsed?.error?.requestId,
    );
    if (response.status === 401 && error.code === 'ACCESS_REQUIRED') {
      accessListeners.forEach((listener) => listener());
    }
    throw error;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (options.responseType === 'text' || !contentType.includes('application/json')) {
    return (await response.text()) as T;
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body' | 'formData'>) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body' | 'formData'>) =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<T>('POST', path, { formData });
  },
};

/** Mensaje legible para cualquier error. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
