import { REPORT_STAGE_LABELS, type ReportDTO } from '@codario/shared';
import { Ban, Check, CircleAlert, Download, FileText, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { InlineNotice } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { displayBytes, displayDuration, displayElapsed } from '@/lib/format';
import { cn } from '@/lib/utils';
import { stagesFor, stageState, type StageState } from './report-stages';

function useElapsed(start: string | null, running: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!start) return null;
  return Math.max(0, now - new Date(start).getTime());
}

function StageIcon({ state }: { state: StageState }) {
  const base = 'flex size-6 shrink-0 items-center justify-center rounded-full border';
  switch (state) {
    case 'done':
      return (
        <span className={cn(base, 'border-success bg-success text-white')}>
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      );
    case 'active':
      return (
        <span className={cn(base, 'border-focus/30 bg-focus-soft')}>
          <Spinner className="size-3.5 text-focus" />
        </span>
      );
    case 'failed':
      return (
        <span className={cn(base, 'border-danger bg-danger text-white')}>
          <X className="size-3.5" strokeWidth={3} />
        </span>
      );
    case 'cancelled':
      return (
        <span className={cn(base, 'border-line-strong bg-subtle text-muted')}>
          <Ban className="size-3.5" />
        </span>
      );
    default:
      return <span className={cn(base, 'border-line-strong bg-surface')} />;
  }
}

interface ReportProgressProps {
  report: ReportDTO;
  onCancel?: () => void;
  onRetry?: () => void;
  cancelling?: boolean;
  retrying?: boolean;
  /** Mostrar el enlace "View report" al terminar. */
  showViewLink?: boolean;
}

/** Progreso de generación basado en las etapas reales del backend (sin porcentajes simulados). */
export function ReportProgress({ report, onCancel, onRetry, cancelling, retrying, showViewLink = true }: ReportProgressProps) {
  const running = report.status === 'RUNNING' || report.status === 'QUEUED';
  const elapsed = useElapsed(report.startedAt ?? report.requestedAt, running);
  const total =
    report.completedAt && report.startedAt ? new Date(report.completedAt).getTime() - new Date(report.startedAt).getTime() : null;
  const stages = stagesFor(report.includeAi);

  const headline =
    report.status === 'QUEUED'
      ? 'Waiting in queue'
      : report.status === 'RUNNING'
        ? `${REPORT_STAGE_LABELS[report.stage]}…`
        : report.status === 'COMPLETED'
          ? REPORT_STAGE_LABELS.COMPLETED
          : report.status === 'FAILED'
            ? 'Generation failed'
            : 'Generation cancelled';

  return (
    <div className="grid gap-5" data-testid="report-progress">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink" aria-live="polite">
          {headline}
        </p>
        <p className="text-ui text-muted">
          {running && elapsed !== null ? `Elapsed ${displayElapsed(elapsed)}` : total !== null ? `Took ${displayDuration(total)}` : null}
        </p>
      </div>

      <ol className="grid gap-0" aria-label="Generation stages">
        {stages.map((stage, index) => {
          const state = stageState(report, stage);
          const duration = report.stageTimings[stage];
          return (
            <li key={stage} className="relative flex gap-3 pb-4 last:pb-0" data-state={state} data-stage={stage}>
              {index < stages.length - 1 ? (
                <span
                  aria-hidden
                  className={cn('absolute left-[11px] top-7 h-[calc(100%-1.75rem+2px)] w-px', state === 'done' ? 'bg-success/40' : 'bg-line')}
                />
              ) : null}
              <StageIcon state={state} />
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pt-0.5">
                <span className={cn('text-sm', state === 'pending' ? 'text-muted' : 'text-ink', state === 'active' && 'font-medium')}>
                  {REPORT_STAGE_LABELS[stage]}
                </span>
                <span className="text-xs text-muted">
                  {state === 'done' && duration !== undefined ? displayDuration(duration) : state === 'failed' ? 'Failed' : null}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {report.status === 'FAILED' && report.errorMessage ? (
        <InlineNotice tone="danger" icon={CircleAlert}>
          <p>{report.errorMessage}</p>
          {report.errorCode ? <p className="mt-0.5 text-xs opacity-80">Error {report.errorCode}</p> : null}
        </InlineNotice>
      ) : null}

      {report.status === 'COMPLETED' ? (
        <div className="flex flex-wrap items-center gap-2">
          {report.downloadUrl ? (
            <Button asChild>
              <a href={report.downloadUrl} download={report.fileName ?? undefined}>
                <Download />
                Download PDF
              </a>
            </Button>
          ) : null}
          {showViewLink ? (
            <Button asChild variant="secondary">
              <Link to={`/reports/${report.id}`}>
                <FileText />
                View report
              </Link>
            </Button>
          ) : null}
          {report.fileSize ? <span className="text-ui text-muted">{displayBytes(report.fileSize)}</span> : null}
        </div>
      ) : null}

      {running && onCancel ? (
        <div>
          <Button variant="secondary" size="sm" onClick={onCancel} loading={cancelling}>
            Cancel generation
          </Button>
        </div>
      ) : null}

      {(report.status === 'FAILED' || report.status === 'CANCELLED') && onRetry ? (
        <div>
          <Button size="sm" onClick={onRetry} loading={retrying}>
            <RotateCcw />
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
