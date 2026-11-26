/**
 * Hooks de datos (TanStack Query) para todos los recursos de la API.
 * El contrato está documentado en docs/API.md y tipado en @codario/shared.
 */
import {
  ACTIVE_REPORT_STATUSES,
  type AccessStatusDTO,
  type FreshnessDTO,
  type GenerateReportInput,
  type GenerateReportResponse,
  type GoogleConnectResponse,
  type GooglePropertyDTO,
  type IntegrationsStatusDTO,
  type MarketDTO,
  type MarketInput,
  type MarketUpdateInput,
  type OverviewDTO,
  type Paginated,
  type PerformanceDTO,
  type PeriodPreset,
  type PropertyVerificationDTO,
  type ReportDetailDTO,
  type ReportDTO,
  type ReportStatus,
  type SettingsDTO,
  type SettingsUpdateInput,
  type TemplateDTO,
  type TemplateInput,
  type TemplatePreviewInput,
  type TemplateUpdateInput,
} from '@codario/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toQueryString } from '@/lib/utils';

export const queryKeys = {
  access: ['access'] as const,
  overview: ['overview'] as const,
  settings: ['settings'] as const,
  integrations: ['integrations'] as const,
  properties: ['google-properties'] as const,
  markets: ['markets'] as const,
  market: (id: string) => ['markets', id] as const,
  freshness: (id: string) => ['markets', id, 'freshness'] as const,
  performance: (id: string, params: PerformanceParams) => ['markets', id, 'performance', params] as const,
  templates: ['templates'] as const,
  template: (id: string) => ['templates', id] as const,
  reports: (filters: ReportFilters) => ['reports', 'list', filters] as const,
  reportsAll: ['reports'] as const,
  report: (id: string) => ['reports', 'detail', id] as const,
  reportStatus: (id: string) => ['reports', 'status', id] as const,
};

export const isActiveStatus = (status: ReportStatus | undefined): boolean =>
  !!status && ACTIVE_REPORT_STATUSES.includes(status);

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export function useAccessStatus() {
  return useQuery({
    queryKey: queryKeys.access,
    queryFn: () => api.get<AccessStatusDTO>('/access/status'),
    staleTime: Infinity,
    retry: 1,
  });
}

export function useUnlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accessKey: string) => api.post<AccessStatusDTO>('/access/unlock', { accessKey }),
    onSuccess: (status) => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'access' });
      queryClient.setQueryData(queryKeys.access, status);
    },
  });
}

export function useLock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/access/lock'),
    onSettled: () => {
      queryClient.setQueryData<AccessStatusDTO>(queryKeys.access, { unlocked: false, expiresAt: null });
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'access' });
    },
  });
}

// ---------------------------------------------------------------------------
// Overview / settings
// ---------------------------------------------------------------------------

export function useOverview() {
  return useQuery({ queryKey: queryKeys.overview, queryFn: () => api.get<OverviewDTO>('/overview') });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => api.get<SettingsDTO>('/settings'), staleTime: 5 * 60_000 });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsUpdateInput) => api.put<SettingsDTO>('/settings', input),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.settings, settings),
  });
}

export function useUploadGlobalLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.upload<SettingsDTO>('/settings/logo', file),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.settings, settings),
  });
}

export function useDeleteGlobalLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<SettingsDTO>('/settings/logo'),
    onSuccess: (settings) => {
      if (settings) queryClient.setQueryData(queryKeys.settings, settings);
      else void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export function useIntegrations() {
  return useQuery({
    queryKey: queryKeys.integrations,
    queryFn: () => api.get<IntegrationsStatusDTO>('/integrations/status'),
  });
}

export function useGoogleProperties(enabled = true) {
  return useQuery({
    queryKey: queryKeys.properties,
    queryFn: () => api.get<GooglePropertyDTO[]>('/integrations/google/properties'),
    enabled,
  });
}

export function useSyncProperties() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<GooglePropertyDTO[]>('/integrations/google/properties/sync'),
    onSuccess: (properties) => {
      queryClient.setQueryData(queryKeys.properties, properties);
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations });
      void queryClient.invalidateQueries({ queryKey: queryKeys.markets });
    },
  });
}

export function useVerifyProperty() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (siteUrl: string) =>
      api.post<PropertyVerificationDTO>('/integrations/google/properties/verify', { siteUrl }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.properties }),
  });
}

export function useConnectGoogle() {
  return useMutation({
    mutationFn: () => api.post<GoogleConnectResponse>('/integrations/google/connect'),
    onSuccess: ({ authorizationUrl }) => {
      window.location.assign(authorizationUrl);
    },
  });
}

export function useDisconnectGoogle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<IntegrationsStatusDTO>('/integrations/google/disconnect'),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.integrations, status);
      queryClient.setQueryData(queryKeys.properties, []);
      void queryClient.invalidateQueries({ queryKey: queryKeys.markets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

export function useMarkets() {
  return useQuery({ queryKey: queryKeys.markets, queryFn: () => api.get<MarketDTO[]>('/markets') });
}

export function useMarket(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.market(id ?? ''),
    queryFn: () => api.get<MarketDTO>(`/markets/${encodeURIComponent(id ?? '')}`),
    enabled: !!id,
  });
}

function invalidateMarkets(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.markets });
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
  void queryClient.invalidateQueries({ queryKey: queryKeys.properties });
}

export function useCreateMarket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MarketInput) => api.post<MarketDTO>('/markets', input),
    onSuccess: () => invalidateMarkets(queryClient),
  });
}

export function useUpdateMarket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MarketUpdateInput }) =>
      api.put<MarketDTO>(`/markets/${encodeURIComponent(id)}`, input),
    onSuccess: (market) => {
      queryClient.setQueryData(queryKeys.market(market.id), market);
      invalidateMarkets(queryClient);
    },
  });
}

export function useDeleteMarket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/markets/${encodeURIComponent(id)}`),
    onSuccess: () => {
      invalidateMarkets(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.reportsAll });
    },
  });
}

export function useUploadMarketLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      api.upload<MarketDTO>(`/markets/${encodeURIComponent(id)}/logo`, file),
    onSuccess: (market) => {
      queryClient.setQueryData(queryKeys.market(market.id), market);
      invalidateMarkets(queryClient);
    },
  });
}

export function useDeleteMarketLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<MarketDTO>(`/markets/${encodeURIComponent(id)}/logo`),
    onSuccess: () => invalidateMarkets(queryClient),
  });
}

export function useMarketFreshness(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.freshness(id ?? ''),
    queryFn: () => api.get<FreshnessDTO>(`/markets/${encodeURIComponent(id ?? '')}/freshness`),
    enabled: !!id && enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export interface PerformanceParams {
  preset: PeriodPreset;
  startDate?: string;
  endDate?: string;
}

export function useMarketPerformance(id: string | undefined, params: PerformanceParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.performance(id ?? '', params),
    queryFn: ({ signal }) =>
      api.get<PerformanceDTO>(
        `/markets/${encodeURIComponent(id ?? '')}/performance${toQueryString({
          preset: params.preset,
          startDate: params.preset === 'CUSTOM' ? params.startDate : undefined,
          endDate: params.preset === 'CUSTOM' ? params.endDate : undefined,
        })}`,
        { signal },
      ),
    enabled: !!id && enabled && (params.preset !== 'CUSTOM' || (!!params.startDate && !!params.endDate)),
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function useTemplates() {
  return useQuery({ queryKey: queryKeys.templates, queryFn: () => api.get<TemplateDTO[]>('/templates') });
}

export function useTemplate(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.template(id ?? ''),
    queryFn: () => api.get<TemplateDTO>(`/templates/${encodeURIComponent(id ?? '')}`),
    enabled: !!id,
  });
}

function invalidateTemplates(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.templates });
  void queryClient.invalidateQueries({ queryKey: queryKeys.markets });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TemplateInput) => api.post<TemplateDTO>('/templates', input),
    onSuccess: () => invalidateTemplates(queryClient),
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TemplateUpdateInput }) =>
      api.put<TemplateDTO>(`/templates/${encodeURIComponent(id)}`, input),
    onSuccess: (template) => {
      queryClient.setQueryData(queryKeys.template(template.id), template);
      invalidateTemplates(queryClient);
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${encodeURIComponent(id)}`),
    onSuccess: () => invalidateTemplates(queryClient),
  });
}

export function useDuplicateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<TemplateDTO>(`/templates/${encodeURIComponent(id)}/duplicate`),
    onSuccess: () => invalidateTemplates(queryClient),
  });
}

export function useResetTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<TemplateDTO>(`/templates/${encodeURIComponent(id)}/reset`),
    onSuccess: (template) => {
      queryClient.setQueryData(queryKeys.template(template.id), template);
      invalidateTemplates(queryClient);
    },
  });
}

export function useTemplatePreview() {
  return useMutation({
    mutationFn: (input: TemplatePreviewInput) => api.post<string>('/templates/preview', input, { responseType: 'text' }),
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportFilters {
  marketId?: string;
  status?: ReportStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function useReports(filters: ReportFilters, options: { refetchWhileActive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.reports(filters),
    queryFn: () => api.get<Paginated<ReportDTO>>(`/reports${toQueryString({ ...filters })}`),
    placeholderData: (previous) => previous,
    refetchInterval: (query) =>
      options.refetchWhileActive !== false && query.state.data?.items.some((r) => isActiveStatus(r.status)) ? 3000 : false,
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.report(id ?? ''),
    queryFn: () => api.get<ReportDetailDTO>(`/reports/${encodeURIComponent(id ?? '')}`),
    enabled: !!id,
  });
}

/** Polling ligero del estado mientras el reporte está en cola o generándose. */
export function useReportStatus(id: string | null | undefined, initial?: ReportDTO) {
  return useQuery({
    queryKey: queryKeys.reportStatus(id ?? ''),
    queryFn: () => api.get<ReportDTO>(`/reports/${encodeURIComponent(id ?? '')}/status`),
    enabled: !!id,
    initialData: initial,
    staleTime: 0,
    refetchInterval: (query) => (isActiveStatus(query.state.data?.status) ? 1500 : false),
    refetchIntervalInBackground: true,
  });
}

function invalidateReports(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.reportsAll });
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
  void queryClient.invalidateQueries({ queryKey: queryKeys.markets });
}

export function useGenerateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateReportInput) => api.post<GenerateReportResponse>('/reports', input),
    onSuccess: ({ report }) => {
      queryClient.setQueryData(queryKeys.reportStatus(report.id), report);
      invalidateReports(queryClient);
    },
  });
}

export function useCancelReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ReportDTO>(`/reports/${encodeURIComponent(id)}/cancel`),
    onSuccess: (report) => {
      queryClient.setQueryData(queryKeys.reportStatus(report.id), report);
      invalidateReports(queryClient);
    },
  });
}

export function useRetryReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<GenerateReportResponse>(`/reports/${encodeURIComponent(id)}/retry`),
    onSuccess: ({ report }) => {
      queryClient.setQueryData(queryKeys.reportStatus(report.id), report);
      invalidateReports(queryClient);
    },
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/reports/${encodeURIComponent(id)}`),
    onSuccess: () => invalidateReports(queryClient),
  });
}
