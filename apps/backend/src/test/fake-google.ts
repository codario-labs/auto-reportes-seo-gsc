/**
 * Simulador de las APIs de Google (OAuth + Search Console) EXCLUSIVO PARA TESTS.
 * Genera respuestas deterministas con la misma forma que la API real.
 */
import { addDays, enumerateDates } from '@codario/shared';

export interface FakeGoogleOptions {
  sites?: Array<{ siteUrl: string; permissionLevel: string }>;
  /** Fecha devuelta como first_incomplete_date en consultas dataState=all. */
  firstIncompleteDate: string;
  /** Devuelve 0 filas en todas las consultas de rendimiento. */
  empty?: boolean;
  /** Dimensiones que responden con error 500. */
  failingDimensions?: string[];
  /** Sitios sin permiso (403). */
  forbiddenSites?: string[];
}

export interface FakeGoogle {
  fetch: typeof fetch;
  calls: Array<{ url: string; body?: unknown }>;
  tokenCounter: { access: number; refresh: number };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const QUERIES = [
  'auditoria seo',
  'agencia seo bogota',
  'consultoria seo',
  'posicionamiento web',
  'seo tecnico',
  'codario labs',
  'marketing digital colombia',
  'diseño web profesional',
  'seo para ecommerce',
  'linkbuilding',
  'que es el seo',
  'precio seo mensual',
  'google search console tutorial',
  'core web vitals',
  'seo local',
  'keyword research',
  'contenido seo',
  'migracion web seo',
  'seo internacional',
  'analitica web',
];
const PAGES = [
  'https://codariolabs.com/',
  'https://codariolabs.com/servicios/seo',
  'https://codariolabs.com/blog/auditoria-seo',
  'https://codariolabs.com/blog/core-web-vitals',
  'https://codariolabs.com/contacto',
  'https://codariolabs.com/blog/seo-local',
  'https://codariolabs.com/casos-de-exito',
  'https://codariolabs.com/blog/keyword-research',
];
const COUNTRIES = ['col', 'mex', 'esp', 'usa', 'arg', 'per', 'chl'];
const DEVICES = ['MOBILE', 'DESKTOP', 'TABLET'];
const APPEARANCES = ['REVIEW_SNIPPET', 'VIDEO'];

function dayTraffic(date: string): { impressions: number; clicks: number; position: number } {
  // Tendencia creciente + estacionalidad semanal.
  const base = new Date(`${date}T00:00:00Z`).getTime() / 86_400_000;
  const trend = 400 + (base % 1000) * 0.4;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const seasonal = weekday === 0 || weekday === 6 ? 0.7 : 1;
  const impressions = Math.round(trend * seasonal * (0.9 + hash(date) * 0.2));
  const clicks = Math.round(impressions * (0.035 + hash(`c${date}`) * 0.01));
  return { impressions, clicks, position: 9 + hash(`p${date}`) * 4 };
}

function dimensionRows(keys: string[], start: string, end: string, salt: string) {
  const dates = enumerateDates(start, end);
  const totalImpr = dates.reduce((s, d) => s + dayTraffic(d).impressions, 0);
  const totalClicks = dates.reduce((s, d) => s + dayTraffic(d).clicks, 0);
  // La cuota de cada clave cambia según el periodo para producir subidas y bajadas.
  const weights = keys.map((k, i) => (1 / (i + 1.3)) * (0.6 + hash(`${salt}${k}${start.slice(0, 7)}`) * 0.8));
  const sum = weights.reduce((a, b) => a + b, 0);
  return keys.map((key, i) => {
    const share = weights[i]! / sum;
    const impressions = Math.max(1, Math.round(totalImpr * share * 0.92));
    const position = 2 + i * 1.1 + hash(`${key}${start}`) * 3;
    const ctrFactor = i === 3 ? 0.15 : 1; // una clave con CTR anómalamente bajo
    const clicks = Math.max(0, Math.round(totalClicks * share * 0.85 * ctrFactor));
    return { keys: [key], clicks, impressions, ctr: clicks / impressions, position };
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function createFakeGoogle(options: FakeGoogleOptions): FakeGoogle {
  const calls: FakeGoogle['calls'] = [];
  const tokenCounter = { access: 0, refresh: 0 };
  const sites = options.sites ?? [{ siteUrl: 'sc-domain:codariolabs.com', permissionLevel: 'siteOwner' }];

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;
    let body: unknown = rawBody;
    if (rawBody?.startsWith('{')) body = JSON.parse(rawBody);
    else if (rawBody) body = Object.fromEntries(new URLSearchParams(rawBody));
    calls.push({ url, body });

    if (url === 'https://oauth2.googleapis.com/token') {
      const form = body as Record<string, string>;
      if (form.grant_type === 'authorization_code') {
        if (form.code === 'bad-code') return json({ error: 'invalid_grant' }, 400);
        tokenCounter.access += 1;
        const idPayload = Buffer.from(JSON.stringify({ sub: 'google-user-1', email: 'seo@codariolabs.com' })).toString('base64url');
        return json({
          access_token: `access-${tokenCounter.access}`,
          refresh_token: 'refresh-secret-token',
          expires_in: 3599,
          scope: 'openid https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.email',
          token_type: 'Bearer',
          id_token: `header.${idPayload}.signature`,
        });
      }
      if (form.grant_type === 'refresh_token') {
        if (form.refresh_token === 'revoked') return json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
        tokenCounter.refresh += 1;
        return json({ access_token: `refreshed-${tokenCounter.refresh}`, expires_in: 3599, token_type: 'Bearer' });
      }
    }
    if (url === 'https://oauth2.googleapis.com/revoke') return new Response('', { status: 200 });

    const gsc = url.match(/^https:\/\/www\.googleapis\.com\/webmasters\/v3(\/.*)$/);
    if (gsc) {
      const path = gsc[1]!;
      if (path === '/sites') return json({ siteEntry: sites });
      const siteMatch = path.match(/^\/sites\/([^/]+)(\/searchAnalytics\/query)?$/);
      if (siteMatch) {
        const siteUrl = decodeURIComponent(siteMatch[1]!);
        if (options.forbiddenSites?.includes(siteUrl)) {
          return json({ error: { code: 403, message: 'User does not have sufficient permission for site', status: 'PERMISSION_DENIED' } }, 403);
        }
        if (!siteMatch[2]) {
          const site = sites.find((s) => s.siteUrl === siteUrl);
          return site ? json(site) : json({ error: { code: 404, message: 'Not found' } }, 404);
        }
        const req = body as { startDate: string; endDate: string; dimensions?: string[]; rowLimit?: number; startRow?: number; dataState?: string };
        const dim = req.dimensions?.[0];
        if (dim && options.failingDimensions?.includes(dim)) return json({ error: { code: 500, message: 'Backend Error' } }, 500);
        if (options.empty) return json({ responseAggregationType: 'byProperty' });
        if (req.dataState === 'all' && dim === 'date') {
          const dates = enumerateDates(req.startDate, addDays(options.firstIncompleteDate, 1) < req.endDate ? addDays(options.firstIncompleteDate, 1) : req.endDate);
          return json({
            rows: dates.map((d) => ({ keys: [d], ...dayTraffic(d), ctr: 0.04 })),
            metadata: { first_incomplete_date: options.firstIncompleteDate },
          });
        }
        if (!dim) {
          const dates = enumerateDates(req.startDate, req.endDate);
          const impressions = dates.reduce((s, d) => s + dayTraffic(d).impressions, 0);
          const clicks = dates.reduce((s, d) => s + dayTraffic(d).clicks, 0);
          const position = dates.reduce((s, d) => s + dayTraffic(d).position * dayTraffic(d).impressions, 0) / impressions;
          return json({ rows: [{ clicks, impressions, ctr: clicks / impressions, position }], responseAggregationType: 'byProperty' });
        }
        let rows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> = [];
        if (dim === 'date') {
          rows = enumerateDates(req.startDate, req.endDate)
            .filter((d) => hash(`gap${d}`) > 0.03) // algún día sin datos
            .map((d) => {
              const t = dayTraffic(d);
              return { keys: [d], clicks: t.clicks, impressions: t.impressions, ctr: t.clicks / t.impressions, position: t.position };
            });
        } else if (dim === 'query') rows = dimensionRows(QUERIES, req.startDate, req.endDate, 'q');
        else if (dim === 'page') rows = dimensionRows(PAGES, req.startDate, req.endDate, 'p');
        else if (dim === 'country') rows = dimensionRows(COUNTRIES, req.startDate, req.endDate, 'c');
        else if (dim === 'device') rows = dimensionRows(DEVICES, req.startDate, req.endDate, 'd');
        else if (dim === 'searchAppearance') rows = dimensionRows(APPEARANCES, req.startDate, req.endDate, 'a').map((r) => ({ ...r, clicks: Math.round(r.clicks / 10) }));
        rows.sort((a, b) => b.clicks - a.clicks);
        const start = req.startRow ?? 0;
        const limit = req.rowLimit ?? 1000;
        return json({ rows: rows.slice(start, start + limit), responseAggregationType: 'auto' });
      }
    }
    return json({ error: { message: `Unhandled fake URL ${url}` } }, 404);
  }) as typeof fetch;

  return { fetch: fakeFetch, calls, tokenCounter };
}
