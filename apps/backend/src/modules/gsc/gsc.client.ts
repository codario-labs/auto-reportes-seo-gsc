/**
 * Cliente REST de Google Search Console API (webmasters v3).
 * Referencia: https://developers.google.com/webmaster-tools/v1/api_reference_index
 */

export const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3';
/** Máximo de filas por petición de searchAnalytics.query. */
export const GSC_MAX_ROW_LIMIT = 25_000;

export type GscDimension = 'date' | 'query' | 'page' | 'country' | 'device' | 'searchAppearance';

export interface GscDimensionFilter {
  dimension: GscDimension;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'includingRegex' | 'excludingRegex';
  expression: string;
}

export interface SearchAnalyticsRequest {
  startDate: string;
  endDate: string;
  dimensions?: GscDimension[];
  type?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews';
  dimensionFilterGroups?: Array<{ groupType?: 'and'; filters: GscDimensionFilter[] }>;
  aggregationType?: 'auto' | 'byPage' | 'byProperty';
  rowLimit?: number;
  startRow?: number;
  dataState?: 'final' | 'all';
}

export interface SearchAnalyticsRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsResponse {
  rows?: SearchAnalyticsRow[];
  responseAggregationType?: string;
  metadata?: { first_incomplete_date?: string; first_incomplete_hour?: string };
}

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export class GscApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(message);
    this.name = 'GscApiError';
  }

  get isRetryable(): boolean {
    return this.status === 429 || this.status === 500 || this.status === 502 || this.status === 503 || this.status === 504;
  }

  get isPermissionDenied(): boolean {
    return this.status === 403;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export type AccessTokenProvider = (options?: { forceRefresh?: boolean }) => Promise<string>;

export interface SearchConsoleClientOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  /** Base del backoff exponencial (ms). */
  retryBaseMs?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('Aborted'));
      },
      { once: true },
    );
  });
}

export class SearchConsoleClient {
  /** Número de peticiones HTTP realizadas (métrica de generación). */
  requestCount = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly getAccessToken: AccessTokenProvider,
    private readonly options: SearchConsoleClientOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 4;
    this.retryBaseMs = options.retryBaseMs ?? 800;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
  }

  async listSites(): Promise<GscSite[]> {
    const body = await this.request<{ siteEntry?: GscSite[] }>('GET', '/sites');
    return body.siteEntry ?? [];
  }

  async getSite(siteUrl: string): Promise<GscSite> {
    return this.request<GscSite>('GET', `/sites/${encodeURIComponent(siteUrl)}`);
  }

  async querySearchAnalytics(siteUrl: string, body: SearchAnalyticsRequest): Promise<SearchAnalyticsResponse> {
    return this.request<SearchAnalyticsResponse>(
      'POST',
      `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      body,
    );
  }

  /**
   * Descarga filas paginando con startRow hasta agotar resultados o alcanzar `maxRows`.
   * GSC devuelve como máximo 25.000 filas por petición.
   */
  async queryAllRows(
    siteUrl: string,
    body: Omit<SearchAnalyticsRequest, 'rowLimit' | 'startRow'>,
    maxRows: number,
  ): Promise<{ rows: SearchAnalyticsRow[]; truncated: boolean }> {
    const rows: SearchAnalyticsRow[] = [];
    let startRow = 0;
    while (rows.length < maxRows) {
      const rowLimit = Math.min(GSC_MAX_ROW_LIMIT, maxRows - rows.length);
      const page = await this.querySearchAnalytics(siteUrl, { ...body, rowLimit, startRow });
      const pageRows = page.rows ?? [];
      rows.push(...pageRows);
      if (pageRows.length < rowLimit) return { rows, truncated: false };
      startRow += pageRows.length;
    }
    return { rows, truncated: true };
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let forceRefresh = false;
    for (let attempt = 0; ; attempt += 1) {
      this.options.signal?.throwIfAborted();
      const token = await this.getAccessToken({ forceRefresh });
      this.requestCount += 1;
      const signals = [AbortSignal.timeout(this.requestTimeoutMs)];
      if (this.options.signal) signals.push(this.options.signal);
      let response: Response;
      try {
        response = await this.fetchImpl(`${GSC_API_BASE}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.any(signals),
        });
      } catch (error) {
        if (this.options.signal?.aborted) throw error;
        if (attempt < this.maxRetries) {
          await sleep(this.backoff(attempt), this.options.signal);
          continue;
        }
        throw new GscApiError(
          `Could not reach the Search Console API: ${error instanceof Error ? error.message : String(error)}`,
          0,
          'network_error',
        );
      }

      if (response.ok) return (await response.json()) as T;

      const apiError = await this.toError(response);
      // Token caducado/revocado entre la comprobación y la petición: reintenta una vez forzando refresh.
      if (apiError.isUnauthorized && !forceRefresh) {
        forceRefresh = true;
        continue;
      }
      if (apiError.isRetryable && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.backoff(attempt);
        await sleep(Math.min(delay, 30_000), this.options.signal);
        continue;
      }
      throw apiError;
    }
  }

  private backoff(attempt: number): number {
    return this.retryBaseMs * 2 ** attempt + Math.floor(Math.random() * this.retryBaseMs);
  }

  private async toError(response: Response): Promise<GscApiError> {
    let message = `Search Console API error (${response.status})`;
    let reason: string | null = null;
    try {
      const body = (await response.json()) as {
        error?: { message?: string; status?: string; errors?: Array<{ reason?: string; message?: string }> };
      };
      if (body.error?.message) message = body.error.message;
      reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? null;
    } catch {
      // cuerpo no JSON
    }
    return new GscApiError(message, response.status, reason);
  }
}
