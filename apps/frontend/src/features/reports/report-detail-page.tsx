import {
  comparisonLabel,
  computeDelta,
  formatAbsoluteChange,
  formatMetricValue,
  formatPercentChange,
  METRIC_KEYS,
  METRIC_META,
  PERIOD_PRESET_LABELS,
  REPORT_STAGE_LABELS,
  REPORT_STAGES,
  type ReportDetailDTO,
} from '@codario/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { MarketAvatar } from '@/components/app/market-avatar';
import { DefinitionList, PageHeader, Panel, PanelHeader } from '@/components/app/panel';
import { EmptyState, ErrorState, InlineNotice } from '@/components/app/states';
import { ReportStatusBadge } from '@/components/app/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isActiveStatus, queryKeys, useReport, useReportStatus, useRetryReport } from '@/features/api-hooks';
import { PerformanceView } from '@/features/performance/performance-view';
import { ApiError, errorMessage } from '@/lib/api';
import { displayBytes, displayDateTime, displayDuration, displayRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AnalysisView } from './analysis-view';
import { TrackedReportProgress } from './generate-report-dialog';
import { useDeleteReportFlow } from './use-delete-report-flow';

export function ReportDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const report = useReport(id);
  const active = isActiveStatus(report.data?.status);
  const status = useReportStatus(active ? id : null);
  const retry = useRetryReport();
  const { requestDelete, dialog } = useDeleteReportFlow(() => navigate('/reports'));

  const liveStatus = status.data?.status;
  useEffect(() => {
    if (active && liveStatus && !isActiveStatus(liveStatus)) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.report(id) });
    }
  }, [active, liveStatus, id, queryClient]);

  if (report.isPending) {
    return (
      <div className="grid gap-6" role="status" aria-label="Loading report">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (report.isError) {
    const notFound = report.error instanceof ApiError && report.error.status === 404;
    return notFound ? (
      <EmptyState
        icon={FileText}
        title="Report not found"
        description="It may have been deleted, or the link is incorrect."
        action={
          <Button asChild variant="secondary">
            <Link to="/reports">Back to reports</Link>
          </Button>
        }
      />
    ) : (
      <ErrorState error={report.error} onRetry={() => void report.refetch()} />
    );
  }

  const data = report.data;
  const period = data.dataset?.period;

  return (
    <>
      <Link to="/reports" className="mb-4 inline-flex items-center gap-1.5 text-ui text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" />
        Reports
      </Link>
      <PageHeader
        leading={<MarketAvatar name={data.market.name} color={data.market.primaryColor} logoUrl={data.market.logoUrl} size="lg" />}
        title={data.market.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {displayRange(data.startDate, data.endDate)} ({PERIOD_PRESET_LABELS[data.periodPreset]})
            </span>
            <span className="text-muted">
              {period ? comparisonLabel(period, 'en') : 'vs.'} ({displayRange(data.compareStartDate, data.compareEndDate)})
            </span>
          </span>
        }
        actions={
          <>
            <ReportStatusBadge status={data.status} />
            {data.status === 'COMPLETED' && data.downloadUrl ? (
              <Button asChild>
                <a href={data.downloadUrl} download={data.fileName ?? undefined}>
                  <Download />
                  Download PDF
                </a>
              </Button>
            ) : null}
            {data.status === 'FAILED' || data.status === 'CANCELLED' ? (
              <Button
                loading={retry.isPending}
                onClick={() =>
                  retry.mutate(data.id, {
                    onSuccess: ({ report: next }) => {
                      toast.success('Report generation restarted');
                      navigate(`/reports/${next.id}`);
                    },
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
              >
                <Sparkles />
                Retry
              </Button>
            ) : null}
            {!active ? (
              <Button variant="ghost" size="icon" aria-label="Delete report" onClick={() => requestDelete(data)}>
                <Trash2 />
              </Button>
            ) : null}
          </>
        }
      />

      {active ? (
        <Panel className="max-w-xl">
          <PanelHeader title="Generation progress" />
          <div className="px-5 py-5">
            <TrackedReportProgress reportId={data.id} showViewLink={false} onReportChange={(next) => navigate(`/reports/${next}`)} />
          </div>
        </Panel>
      ) : data.status === 'FAILED' || data.status === 'CANCELLED' ? (
        <div className="grid gap-6">
          <InlineNotice tone={data.status === 'FAILED' ? 'danger' : 'neutral'} icon={TriangleAlert}>
            <p className="font-medium">{data.status === 'FAILED' ? 'This report failed to generate.' : 'This report was cancelled.'}</p>
            {data.errorMessage ? <p className="mt-0.5">{data.errorMessage}</p> : null}
            {data.errorCode ? <p className="mt-0.5 text-xs opacity-80">Error {data.errorCode}, at stage {REPORT_STAGE_LABELS[data.stage]}</p> : null}
          </InlineNotice>
          <GenerationPanel report={data} />
        </div>
      ) : (
        <CompletedReport report={data} />
      )}
      {dialog}
    </>
  );
}

function CompletedReport({ report }: { report: ReportDetailDTO }) {
  return (
    <Tabs defaultValue="summary">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="analysis">AI analysis</TabsTrigger>
        <TabsTrigger value="data">Search Console data</TabsTrigger>
        <TabsTrigger value="generation">Generation</TabsTrigger>
      </TabsList>
      <TabsContent value="summary" className="grid gap-6">
        <KpiComparison report={report} />
        {report.analysis ? (
          <Panel>
            <PanelHeader title="Headline" />
            <div className="grid gap-2 px-5 py-5" lang="es">
              <p className="max-w-[60ch] text-lg font-semibold leading-snug tracking-[-0.01em]">{report.analysis.executiveSummary.headline}</p>
              <p className="max-w-[72ch] text-sm leading-relaxed text-ink-2">{report.analysis.executiveSummary.overview}</p>
            </div>
          </Panel>
        ) : null}
      </TabsContent>
      <TabsContent value="analysis">
        {report.analysis ? (
          <AnalysisView analysis={report.analysis} recommendations={report.recommendations} dataset={report.dataset} />
        ) : (
          <Panel>
            <EmptyState
              icon={Sparkles}
              title={report.includeAi ? 'No AI analysis is stored for this report' : 'AI analysis was not requested for this report'}
              description={
                report.includeAi
                  ? 'The PDF only contains the Search Console metrics.'
                  : 'Generate a new report with "Include AI analysis" turned on to get findings and recommendations.'
              }
            />
          </Panel>
        )}
      </TabsContent>
      <TabsContent value="data">
        {report.dataset ? (
          <PerformanceView dataset={report.dataset} />
        ) : (
          <Panel>
            <EmptyState icon={FileText} title="No dataset stored for this report" />
          </Panel>
        )}
      </TabsContent>
      <TabsContent value="generation">
        <GenerationPanel report={report} />
      </TabsContent>
    </Tabs>
  );
}

function KpiComparison({ report }: { report: ReportDetailDTO }) {
  const rows = METRIC_KEYS.map((metric) => {
    const stored = report.metrics.find((m) => m.metric === metric);
    const fromDataset = report.dataset?.totals.deltas.find((d) => d.metric === metric);
    const current = stored?.currentValue ?? fromDataset?.current ?? null;
    const previous = stored?.previousValue ?? fromDataset?.previous ?? null;
    return computeDelta(metric, current, previous);
  });
  return (
    <Panel>
      <PanelHeader title="Key metrics" description="Current period compared with the equivalent previous period." />
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Metric</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">Previous</TableHead>
            <TableHead className="text-right">Change</TableHead>
            <TableHead className="text-right">Change %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((delta) => {
            const tone = delta.sentiment === 'positive' ? 'text-success' : delta.sentiment === 'negative' ? 'text-danger' : 'text-muted';
            return (
              <TableRow key={delta.metric}>
                <TableCell className="font-medium">{METRIC_META[delta.metric].longLabel}</TableCell>
                <TableCell className="text-right text-base font-semibold">{formatMetricValue(delta.metric, delta.current)}</TableCell>
                <TableCell className="text-right text-ink-2">{formatMetricValue(delta.metric, delta.previous)}</TableCell>
                <TableCell className={cn('text-right font-medium', tone)} data-sentiment={delta.sentiment}>
                  {formatAbsoluteChange(delta.metric, delta.absoluteChange)}
                </TableCell>
                <TableCell className={cn('text-right font-medium', tone)}>{formatPercentChange(delta.percentChange)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}

function GenerationPanel({ report }: { report: ReportDetailDTO }) {
  const meta = report.generationMeta;
  const timings = meta?.stageTimings ?? report.stageTimings;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Generation details" />
        <div className="px-5 py-5">
          <DefinitionList
            items={[
              { label: 'Template', value: report.template?.name ?? 'Deleted template' },
              { label: 'Requested', value: displayDateTime(report.requestedAt) },
              { label: 'Completed', value: displayDateTime(report.completedAt) },
              { label: 'PDF', value: report.fileName ? `${report.fileName} (${displayBytes(report.fileSize)})` : '—' },
              { label: 'AI model', value: report.includeAi ? (meta?.ai?.servedBy ?? report.aiModel ?? '—') : 'Not requested' },
              ...(meta?.ai
                ? [
                    {
                      label: 'AI tokens',
                      value: `${meta.ai.inputTokens.toLocaleString('en-US')} in, ${meta.ai.outputTokens.toLocaleString('en-US')} out`,
                    },
                    { label: 'AI attempts', value: `${meta.ai.attempts}${meta.ai.fallbackUsed ? ' (fallback model used)' : ''}` },
                  ]
                : []),
              ...(meta
                ? [
                    { label: 'Search Console', value: `${meta.gscRequests} requests, ${meta.rowsFetched.toLocaleString('en-US')} rows` },
                    ...(meta.pdf ? [{ label: 'PDF pages', value: String(meta.pdf.pages) }] : []),
                  ]
                : []),
            ]}
          />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Stage timings" description="Measured on the server for each completed stage." />
        <ol className="grid gap-0 px-5 py-3">
          {REPORT_STAGES.filter((s) => s !== 'QUEUED' && s !== 'COMPLETED').map((stage) => (
            <li key={stage} className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-sm last:border-0">
              <span className={timings[stage] === undefined ? 'text-muted' : 'text-ink'}>{REPORT_STAGE_LABELS[stage]}</span>
              <span className="text-ui text-ink-2">{timings[stage] === undefined ? 'Skipped' : displayDuration(timings[stage])}</span>
            </li>
          ))}
        </ol>
      </Panel>
      {meta && (meta.warnings.length > 0 || (meta.ai?.groundingWarnings.length ?? 0) > 0) ? (
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Warnings"
            description="Grounding warnings list AI references to queries or pages that were not in the dataset and were removed."
          />
          <ul className="grid gap-1.5 px-5 py-4 text-ui text-ink-2">
            {[...meta.warnings, ...(meta.ai?.groundingWarnings ?? [])].map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
