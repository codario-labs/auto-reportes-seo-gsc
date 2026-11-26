import { REPORT_STATUS_LABELS, type MarketStatus, type ReportStatus } from '@codario/shared';
import { Ban, CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/misc';

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  switch (status) {
    case 'COMPLETED':
      return (
        <Badge variant="success">
          <CircleCheck />
          {REPORT_STATUS_LABELS.COMPLETED}
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge variant="danger">
          <CircleAlert />
          {REPORT_STATUS_LABELS.FAILED}
        </Badge>
      );
    case 'CANCELLED':
      return (
        <Badge variant="neutral">
          <Ban />
          {REPORT_STATUS_LABELS.CANCELLED}
        </Badge>
      );
    case 'RUNNING':
      return (
        <Badge variant="info">
          <Spinner className="size-3 text-focus" />
          {REPORT_STATUS_LABELS.RUNNING}
        </Badge>
      );
    case 'QUEUED':
      return (
        <Badge variant="outline">
          <Clock />
          {REPORT_STATUS_LABELS.QUEUED}
        </Badge>
      );
  }
}

export function MarketStatusBadge({ status }: { status: MarketStatus }) {
  if (status === 'ACTIVE') return <Badge variant="success">Active</Badge>;
  if (status === 'PAUSED') return <Badge variant="warning">Paused</Badge>;
  return <Badge variant="neutral">Archived</Badge>;
}

/** Punto de estado de una conexión. */
export function StatusDot({ tone }: { tone: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const color = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    neutral: 'bg-line-strong',
  }[tone];
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${color}`} />;
}
