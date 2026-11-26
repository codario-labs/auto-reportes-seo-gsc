import { CircleAlert, RotateCcw } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 px-6 py-8' : 'gap-3 px-6 py-14', className)}>
      {Icon ? (
        <div className="flex size-10 items-center justify-center rounded-panel border border-line bg-subtle text-ink-2">
          <Icon className="size-5" />
        </div>
      ) : null}
      <div className="grid max-w-md gap-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? <div className="text-ui text-muted">{description}</div> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function ErrorState({ error, title = 'This could not be loaded', onRetry, action, className, compact }: ErrorStateProps) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const code = error instanceof ApiError ? error.code : undefined;
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 text-center', compact ? 'px-6 py-8' : 'px-6 py-14', className)}>
      <div className="flex size-10 items-center justify-center rounded-panel bg-danger-soft text-danger">
        <CircleAlert className="size-5" />
      </div>
      <div className="grid max-w-md gap-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-ui text-ink-2">{errorMessage(error)}</p>
        {code || requestId ? (
          <p className="text-xs text-muted">
            {code ? `Error ${code}` : null}
            {code && requestId ? ', ' : null}
            {requestId ? `request ${requestId}` : null}
          </p>
        ) : null}
      </div>
      {onRetry || action ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <RotateCcw />
              Try again
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

/** Esqueleto genérico de tabla para estados de carga. */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="grid gap-0" aria-label="Loading" role="status">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-0">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-1/3' : 'w-16')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Aviso en línea (información, advertencia o error). */
export function InlineNotice({
  tone = 'neutral',
  icon: Icon,
  children,
  className,
}: {
  tone?: 'neutral' | 'warning' | 'danger' | 'success' | 'info';
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  const toneClass = {
    neutral: 'border-line bg-subtle text-ink-2',
    warning: 'border-warning/20 bg-warning-soft text-warning',
    danger: 'border-danger/20 bg-danger-soft text-danger',
    success: 'border-success/20 bg-success-soft text-success',
    info: 'border-focus/15 bg-focus-soft text-focus',
  }[tone];
  return (
    <div className={cn('flex items-start gap-2.5 rounded-control border px-3 py-2.5 text-ui', toneClass, className)}>
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0" /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
