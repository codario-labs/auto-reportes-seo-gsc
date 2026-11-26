import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AppProviders } from '@/app';
import { routes } from '@/routes';
import {
  integrationsFixture,
  marketFixture,
  overviewFixture,
  settingsFixture,
  templateFixture,
} from './fixtures';

export interface MockRequest {
  method: string;
  url: URL;
  body: unknown;
}

export type MockResult = { status?: number; body?: unknown } | Promise<never>;
export type MockHandler = MockResult | ((request: MockRequest) => MockResult);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body ?? null), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Sustituye fetch por un enrutador de respuestas simuladas ("METHOD /api/path"). */
export function mockApi(handlers: Record<string, MockHandler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const handler = handlers[`${method} ${url.pathname}${url.search}`] ?? handlers[`${method} ${url.pathname}`];
    if (!handler) {
      return jsonResponse(404, { error: { code: 'NOT_FOUND', message: `No mock for ${method} ${url.pathname}` } });
    }
    let body: unknown = init?.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        /* cuerpo no JSON */
      }
    }
    const result = typeof handler === 'function' ? handler({ method, url, body }) : handler;
    const resolved = await result;
    if (resolved.status === 204) return new Response(null, { status: 204 });
    return jsonResponse(resolved.status ?? 200, resolved.body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Respuestas base de una sesión desbloqueada con un market y una plantilla. */
export function baseHandlers(): Record<string, MockHandler> {
  return {
    'GET /api/access/status': { body: { unlocked: true, expiresAt: null } },
    'GET /api/settings': { body: settingsFixture },
    'GET /api/integrations/status': { body: integrationsFixture },
    'GET /api/overview': { body: overviewFixture },
    'GET /api/markets': { body: [marketFixture] },
    'GET /api/templates': { body: [templateFixture] },
    'GET /api/reports': { body: { items: [], total: 0, page: 1, pageSize: 20 } },
    'GET /api/integrations/google/properties': { body: [] },
  };
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
}

/** Renderiza la aplicación completa (rutas reales) en una ruta inicial. */
export function renderApp(path = '/') {
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, router, queryClient };
}

/** Renderiza un componente suelto con proveedores y router de memoria. */
export function renderWithProviders(ui: ReactNode, path = '/') {
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [path] });
  const utils = render(
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...utils, router, queryClient };
}
