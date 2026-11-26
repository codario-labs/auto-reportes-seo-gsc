import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

/** Errores 4xx no se reintentan: el resultado no cambiará repitiendo la petición. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status >= 400 && error.status < 500) return false;
    if (error.code === 'GSC_API_ERROR' || error.code === 'INTEGRATION_NOT_CONFIGURED') return false;
  }
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
