import { propertyDisplayName, type MarketDTO, type PerformanceDTO } from '@codario/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarX2, CircleAlert, FileText, Pencil, Plug, RefreshCw, SearchX, Sparkles, Unplug } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { MarketAvatar } from '@/components/app/market-avatar';
import { PeriodSelector, type PeriodValue } from '@/components/app/period-selector';
import { DefinitionList, PageHeader, Panel, PanelHeader } from '@/components/app/panel';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/app/states';
import { MarketStatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { queryKeys, useMarket, useMarketPerformance, useReports, useSettings, type PerformanceParams } from '@/features/api-hooks';
import { PerformanceView } from '@/features/performance/performance-view';
import { GenerateReportDialog } from '@/features/reports/generate-report-dialog';
import { ReportsTable } from '@/features/reports/reports-table';
import { useDeleteReportFlow } from '@/features/reports/use-delete-report-flow';
import { api, ApiError, errorMessage } from '@/lib/api';
import { displayDateTime } from '@/lib/format';
import { toQueryString } from '@/lib/utils';
import { BackLink } from './market-form-page';
import { PropertyLabel, PropertyTypeBadge } from './property-label';

export function MarketDetailPage() {
  const { id = '' } = useParams();
  const market = useMarket(id);
  const [generateOpen, setGenerateOpen] = useState(false);

  if (market.isPending) {
    return (
      <div className="grid gap-6" role="status" aria-label="Loading market">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-panel" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-[420px] w-full rounded-panel" />
      </div>
    );
  }

  if (market.isError) {
    const notFound = market.error instanceof ApiError && market.error.status === 404;
    return notFound ? (
      <EmptyState
        icon={SearchX}
        title="Market not found"
        description="It may have been deleted."
        action={
          <Button asChild variant="secondary">
            <Link to="/markets">Back to markets</Link>
          </Button>
        }
      />
    ) : (
      <ErrorState error={market.error} onRetry={() => void market.refetch()} />
    );
  }

  const m = market.data;

  return (
    <>
      <BackLink to="/markets" label="Markets" />
      <PageHeader
        leading={<MarketAvatar name={m.name} color={m.primaryColor} logoUrl={m.logoUrl} size="lg" />}
        title={m.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a href={`https://${m.domain}`} target="_blank" rel="noreferrer noopener" className="hover:underline">
              {m.domain}
            </a>
            {m.gscSiteUrl ? (
              propertyDisplayName(m.gscSiteUrl) === m.domain ? (
                <PropertyTypeBadge siteUrl={m.gscSiteUrl} />
              ) : (
                <PropertyLabel siteUrl={m.gscSiteUrl} />
              )
            ) : (
              <span className="text-muted">No Search Console property</span>
            )}
            <MarketStatusBadge status={m.status} />
          </span>
        }
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to={`/markets/${m.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
            <Button onClick={() => setGenerateOpen(true)} disabled={!m.gscSiteUrl}>
              <Sparkles />
              Generate report
            </Button>
          </>
        }
      />

      <Tabs defaultValue="performance">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="reports">
            Reports
            {m.reportsCount > 0 ? <span className="text-xs text-muted">{m.reportsCount}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="performance">
          <MarketPerformance market={m} />
        </TabsContent>
        <TabsContent value="reports">
          <MarketReports market={m} onGenerate={() => setGenerateOpen(true)} />
        </TabsContent>
        <TabsContent value="details">
          <MarketDetails market={m} />
        </TabsContent>
      </Tabs>

      <GenerateReportDialog open={generateOpen} onOpenChange={setGenerateOpen} defaultMarketId={m.id} lockMarket />
    </>
  );
}

function MarketPerformance({ market }: { market: MarketDTO }) {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const [periodOverride, setPeriodOverride] = useState<PeriodValue | null>(null);
  const period: PeriodValue = periodOverride ?? { preset: settings.data?.defaultPeriodPreset ?? 'LAST_28_DAYS' };
  const params: PerformanceParams = { preset: period.preset, startDate: period.startDate, endDate: period.endDate };
  const performance = useMarketPerformance(market.id, params, !!market.gscSiteUrl);

  const refresh = useMutation({
    mutationFn: () =>
      api.get<PerformanceDTO>(
        `/markets/${encodeURIComponent(market.id)}/performance${toQueryString({
          preset: params.preset,
          startDate: params.preset === 'CUSTOM' ? params.startDate : undefined,
          endDate: params.preset === 'CUSTOM' ? params.endDate : undefined,
          refresh: true,
        })}`,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.performance(market.id, params), data);
      toast.success('Data refreshed from Search Console');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!market.gscSiteUrl) {
    return (
      <Panel>
        <EmptyState
          icon={Plug}
          title="Assign a Search Console property"
          description="Performance data and reports need the property this market should read from."
          action={
            <Button asChild>
              <Link to={`/markets/${market.id}/edit`}>Choose property</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <PeriodSelector value={period} onChange={setPeriodOverride} marketId={market.id} />
        <Button
          variant="secondary"
          size="sm"
          loading={refresh.isPending}
          disabled={!performance.data}
          onClick={() => refresh.mutate()}
        >
          {refresh.isPending ? null : <RefreshCw />}
          Refresh data
        </Button>
      </div>

      {performance.isPending ? (
        <div className="grid gap-6" role="status" aria-label="Loading Search Console data">
          <Panel>
            <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="grid gap-2 bg-surface px-5 py-4">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
            <div className="p-5">
              <Skeleton className="h-[280px] w-full" />
            </div>
          </Panel>
          <Panel>
            <TableSkeleton rows={6} columns={6} />
          </Panel>
        </div>
      ) : performance.isError ? (
        <Panel>
          <PerformanceError error={performance.error} market={market} onRetry={() => void performance.refetch()} />
        </Panel>
      ) : (
        <PerformanceView dataset={performance.data} refreshing={performance.isFetching && performance.isPlaceholderData} />
      )}
    </div>
  );
}

/** Mensajes específicos por código de error de Search Console / configuración. */
export function PerformanceError({ error, market, onRetry }: { error: unknown; market: MarketDTO; onRetry?: () => void }) {
  const code = error instanceof ApiError ? error.code : null;
  switch (code) {
    case 'GOOGLE_NOT_CONNECTED':
      return (
        <EmptyState
          icon={Unplug}
          title="Google Search Console is not connected"
          description={error instanceof Error ? error.message : undefined}
          action={
            <Button asChild>
              <Link to="/integrations">Connect Google account</Link>
            </Button>
          }
        />
      );
    case 'MARKET_PROPERTY_MISSING':
      return (
        <EmptyState
          icon={Plug}
          title="This market has no Search Console property"
          action={
            <Button asChild>
              <Link to={`/markets/${market.id}/edit`}>Choose property</Link>
            </Button>
          }
        />
      );
    case 'GSC_PROPERTY_INACCESSIBLE':
      return (
        <EmptyState
          icon={CircleAlert}
          title="The connected Google account can't access this property"
          description={
            <>
              {error instanceof Error ? error.message : null} Check that{' '}
              {market.gscSiteUrl ? propertyDisplayName(market.gscSiteUrl) : 'the property'} is shared with the connected account in Search
              Console, or choose another property.
            </>
          }
          action={
            <>
              <Button asChild variant="secondary">
                <Link to="/integrations">Review integration</Link>
              </Button>
              <Button asChild>
                <Link to={`/markets/${market.id}/edit`}>Change property</Link>
              </Button>
            </>
          }
        />
      );
    case 'PERIOD_UNAVAILABLE':
      return (
        <EmptyState
          icon={CalendarX2}
          title="No finalized data for this period yet"
          description={error instanceof Error ? error.message : undefined}
        />
      );
    case 'INTEGRATION_NOT_CONFIGURED':
      return (
        <EmptyState
          icon={Plug}
          title="Google OAuth is not configured on the server"
          description={error instanceof Error ? error.message : undefined}
          action={
            <Button asChild variant="secondary">
              <Link to="/integrations">See setup steps</Link>
            </Button>
          }
        />
      );
    default:
      return <ErrorState error={error} title="Search Console data could not be loaded" onRetry={onRetry} />;
  }
}

function MarketReports({ market, onGenerate }: { market: MarketDTO; onGenerate: () => void }) {
  const reports = useReports({ marketId: market.id, pageSize: 50 });
  const { requestDelete, dialog } = useDeleteReportFlow();
  return (
    <Panel>
      {reports.isPending ? (
        <TableSkeleton rows={4} columns={4} />
      ) : reports.isError ? (
        <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />
      ) : reports.data.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports for this market yet"
          action={
            market.gscSiteUrl ? (
              <Button onClick={onGenerate}>
                <Sparkles />
                Generate report
              </Button>
            ) : null
          }
        />
      ) : (
        <ReportsTable reports={reports.data.items} showMarket={false} onDelete={requestDelete} />
      )}
      {dialog}
    </Panel>
  );
}

function MarketDetails({ market }: { market: MarketDTO }) {
  const swatch = (color: string) => (
    <span className="inline-flex items-center gap-2">
      <span className="size-4 rounded-[4px] border border-line" style={{ backgroundColor: color }} aria-hidden />
      {color}
    </span>
  );
  return (
    <Panel>
      <PanelHeader
        title="Market details"
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to={`/markets/${market.id}/edit`}>
              <Pencil />
              Edit market
            </Link>
          </Button>
        }
      />
      <div className="px-5 py-5">
        <DefinitionList
          items={[
            { label: 'Name', value: market.name },
            { label: 'Domain', value: market.domain },
            { label: 'Description', value: market.description ?? <span className="text-muted">None</span> },
            {
              label: 'Search Console property',
              value: market.gscSiteUrl ? (
                <span className="grid gap-0.5">
                  <span>{market.gscSiteUrl}</span>
                  {market.googleProperty ? (
                    <span className="text-xs text-muted">
                      Permission {market.googleProperty.permissionLevel}
                      {market.googleProperty.lastVerifiedAt ? `, verified ${displayDateTime(market.googleProperty.lastVerifiedAt)}` : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-warning">Not found in the connected account</span>
                  )}
                </span>
              ) : (
                <span className="text-muted">Not assigned</span>
              ),
            },
            { label: 'Template', value: market.template?.name ?? <span className="text-muted">Workspace default</span> },
            { label: 'Primary color', value: swatch(market.primaryColor) },
            { label: 'Secondary color', value: swatch(market.secondaryColor) },
            { label: 'Status', value: <MarketStatusBadge status={market.status} /> },
            { label: 'Created', value: displayDateTime(market.createdAt) },
            { label: 'Updated', value: displayDateTime(market.updatedAt) },
          ]}
        />
      </div>
    </Panel>
  );
}
