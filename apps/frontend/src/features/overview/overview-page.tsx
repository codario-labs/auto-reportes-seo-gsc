import type { OverviewDTO } from '@codario/shared';
import { FileText, Globe } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader, Panel, PanelHeader } from '@/components/app/panel';
import { EmptyState, ErrorState } from '@/components/app/states';
import { StatusDot } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { useOverview } from '@/features/api-hooks';
import { GenerateReportDialog } from '@/features/reports/generate-report-dialog';
import { GenerateReportForm } from '@/features/reports/generate-report-form';
import { ReportsTable } from '@/features/reports/reports-table';
import { useDeleteReportFlow } from '@/features/reports/use-delete-report-flow';

export function OverviewPage() {
  const overview = useOverview();
  const [trackedReportId, setTrackedReportId] = useState<string | null>(null);
  const { requestDelete, dialog } = useDeleteReportFlow();

  return (
    <>
      <PageHeader title="Overview" description="Generate a report, then follow its progress and download the PDF." />

      <Panel className="mb-6">
        <PanelHeader
          title="Generate report"
          description="Pick a market and a period. Branding and sections come from the template."
        />
        <div className="px-5 py-5">
          <GenerateReportForm layout="inline" onCreated={({ report }) => setTrackedReportId(report.id)} />
        </div>
      </Panel>

      {overview.isPending ? (
        <div role="status" aria-label="Loading overview" className="grid gap-6">
          <Skeleton className="h-[76px] w-full rounded-panel" />
          <Skeleton className="h-64 w-full rounded-panel" />
        </div>
      ) : overview.isError ? (
        <Panel>
          <ErrorState error={overview.error} title="The overview could not be loaded" onRetry={() => void overview.refetch()} />
        </Panel>
      ) : (
        <>
          <StatusStrip data={overview.data} />
          <Panel>
            <PanelHeader
              title="Recent reports"
              actions={
                overview.data.recentReports.length > 0 ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/reports">All reports</Link>
                  </Button>
                ) : null
              }
            />
            {overview.data.recentReports.length > 0 ? (
              <ReportsTable reports={overview.data.recentReports} onDelete={requestDelete} />
            ) : overview.data.markets.total === 0 ? (
              <EmptyState
                icon={Globe}
                title="Start by adding a market"
                description="A market is a website with its own Search Console property, logo and colors."
                action={
                  <Button asChild>
                    <Link to="/markets/new">New market</Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={FileText}
                title="No reports yet"
                description="Use the form above to generate the first one. It usually takes under a few minutes."
              />
            )}
          </Panel>
        </>
      )}

      <GenerateReportDialog
        open={!!trackedReportId}
        onOpenChange={(open) => (!open ? setTrackedReportId(null) : undefined)}
        reportId={trackedReportId}
      />
      {dialog}
    </>
  );
}

function StatusStrip({ data }: { data: OverviewDTO }) {
  const { google, anthropic } = data.integrations;
  const googleTone = google.connected && google.status === 'CONNECTED' ? 'success' : google.connected ? 'danger' : 'neutral';
  return (
    <Panel className="mb-6 grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-4">
      <StripItem label="Markets" to="/markets">
        <span className="text-xl font-semibold tracking-[-0.02em]">{data.markets.active}</span>
        <span className="text-ui text-muted">
          active of {data.markets.total}
          {data.markets.total > data.markets.withProperty ? `, ${data.markets.total - data.markets.withProperty} without property` : ''}
        </span>
      </StripItem>
      <StripItem label="Google Search Console" to="/integrations">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <StatusDot tone={googleTone} />
          {!google.configured ? 'Not configured' : google.connected ? (google.status === 'CONNECTED' ? 'Connected' : 'Needs attention') : 'Not connected'}
        </span>
        <span className="truncate text-ui text-muted">
          {google.connected ? (google.email ?? `${google.propertiesCount} properties`) : google.configured ? 'Connect a Google account' : 'Missing OAuth credentials'}
        </span>
      </StripItem>
      <StripItem label="AI analysis" to="/integrations">
        <span className="flex items-center gap-2 text-sm font-medium">
          <StatusDot tone={anthropic.configured ? 'success' : 'neutral'} />
          {anthropic.configured ? 'Anthropic configured' : 'Not configured'}
        </span>
        <span className="truncate text-ui text-muted">{anthropic.configured ? anthropic.model : 'ANTHROPIC_API_KEY is missing'}</span>
      </StripItem>
      <StripItem label="Reports this month" to="/reports">
        <span className="text-xl font-semibold tracking-[-0.02em]">{data.reports.completedThisMonth}</span>
        <span className="text-ui text-muted">
          {data.reports.running > 0 ? `${data.reports.running} generating, ` : ''}
          {data.reports.failedLast7Days > 0 ? `${data.reports.failedLast7Days} failed this week` : `${data.reports.total} in total`}
        </span>
      </StripItem>
    </Panel>
  );
}

function StripItem({ label, to, children }: { label: string; to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="grid min-w-0 content-start gap-1 bg-surface px-5 py-4 transition-colors duration-150 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/40"
    >
      <span className="text-ui text-muted">{label}</span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">{children}</span>
    </Link>
  );
}

