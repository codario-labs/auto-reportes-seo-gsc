import { REPORT_STATUS_LABELS, REPORT_STATUSES, type ReportStatus } from '@codario/shared';
import { ChevronLeft, ChevronRight, FileText, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader, Panel } from '@/components/app/panel';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMarkets, useReports, type ReportFilters } from '@/features/api-hooks';
import { GenerateReportDialog } from './generate-report-dialog';
import { ReportsTable } from './reports-table';
import { useDeleteReportFlow } from './use-delete-report-flow';

const ALL = '__all__';
const PAGE_SIZE = 20;

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const [generateOpen, setGenerateOpen] = useState(false);
  const markets = useMarkets();

  const filters: ReportFilters = {
    marketId: params.get('marketId') ?? undefined,
    status: (params.get('status') as ReportStatus | null) ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    page: Number(params.get('page') ?? '1') || 1,
    pageSize: PAGE_SIZE,
  };
  const reports = useReports(filters);
  const { requestDelete, dialog } = useDeleteReportFlow();

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const hasFilters = !!(filters.marketId || filters.status || filters.from || filters.to);
  const total = reports.data?.total ?? 0;
  const page = filters.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Reports"
        description="Every generated report, with its PDF and the data used to build it."
        actions={
          <Button onClick={() => setGenerateOpen(true)}>
            <Sparkles />
            Generate report
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,14rem)_minmax(0,11rem)_10rem_10rem_auto] lg:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="filter-market">Market</Label>
          <Select value={filters.marketId ?? ALL} onValueChange={(v) => update('marketId', v === ALL ? null : v)}>
            <SelectTrigger id="filter-market">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All markets</SelectItem>
              <SelectSeparator />
              {markets.data?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-status">Status</Label>
          <Select value={filters.status ?? ALL} onValueChange={(v) => update('status', v === ALL ? null : v)}>
            <SelectTrigger id="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              <SelectSeparator />
              {REPORT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {REPORT_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-from">Requested from</Label>
          <Input id="filter-from" type="date" value={filters.from ?? ''} max={filters.to} onChange={(e) => update('from', e.target.value || null)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="filter-to">Requested to</Label>
          <Input id="filter-to" type="date" value={filters.to ?? ''} min={filters.from} onChange={(e) => update('to', e.target.value || null)} />
        </div>
        {hasFilters ? (
          <Button variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <Panel>
        {reports.isPending ? (
          <TableSkeleton rows={6} columns={5} />
        ) : reports.isError ? (
          <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />
        ) : reports.data.items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={hasFilters ? 'No reports match these filters' : 'No reports yet'}
            description={hasFilters ? 'Change or clear the filters to see more reports.' : 'Generate the first report for one of your markets.'}
            action={
              hasFilters ? null : (
                <Button onClick={() => setGenerateOpen(true)}>
                  <Sparkles />
                  Generate report
                </Button>
              )
            }
          />
        ) : (
          <>
            <ReportsTable reports={reports.data.items} onDelete={requestDelete} />
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-ui text-muted">
              <span>
                {total.toLocaleString('en-US')} report{total === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-2">
                Page {page} of {pageCount}
                <Button variant="secondary" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => update('page', String(page - 1))}>
                  <ChevronLeft />
                </Button>
                <Button variant="secondary" size="icon-sm" aria-label="Next page" disabled={page >= pageCount} onClick={() => update('page', String(page + 1))}>
                  <ChevronRight />
                </Button>
              </span>
            </div>
          </>
        )}
      </Panel>

      <GenerateReportDialog open={generateOpen} onOpenChange={setGenerateOpen} defaultMarketId={filters.marketId} />
      {dialog}
    </>
  );
}
