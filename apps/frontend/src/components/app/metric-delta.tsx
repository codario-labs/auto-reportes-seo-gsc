import {
  computeDelta,
  formatAbsoluteChange,
  formatPercentChange,
  type MetricDelta as MetricDeltaValue,
  type MetricKey,
} from '@codario/shared';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const SENTIMENT_CLASS = {
  positive: 'text-success',
  negative: 'text-danger',
  neutral: 'text-muted',
} as const;

interface MetricDeltaProps {
  delta: MetricDeltaValue;
  /** "percent" muestra la variación relativa (por defecto), "absolute" la diferencia con unidades. */
  mode?: 'percent' | 'absolute';
  className?: string;
}

/**
 * Variación de una métrica con su sentimiento correcto:
 * una bajada de la posición media es una mejora (positiva).
 */
export function MetricDelta({ delta, mode = 'percent', className }: MetricDeltaProps) {
  const Icon = delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : Minus;
  const usePercent = mode === 'percent' && delta.metric !== 'ctr' && delta.metric !== 'position';
  const text =
    delta.absoluteChange === null
      ? 'No comparison'
      : usePercent && delta.percentChange !== null
        ? formatPercentChange(delta.percentChange)
        : formatAbsoluteChange(delta.metric, delta.absoluteChange);
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 text-ui font-medium', SENTIMENT_CLASS[delta.sentiment], className)}
      data-sentiment={delta.sentiment}
      title={
        delta.previous !== null
          ? `Previous: ${delta.previous}${delta.percentChange !== null ? ` (${formatPercentChange(delta.percentChange)})` : ''}`
          : undefined
      }
    >
      {delta.absoluteChange === null ? null : <Icon className="size-3.5" aria-hidden />}
      {text}
    </span>
  );
}

/** Variación absoluta de una fila de tabla (p. ej. Δ clics), coloreada según su sentimiento. */
export function ChangeCell({ metric, value }: { metric: MetricKey; value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  const sentiment = computeDelta(metric, value, 0).sentiment;
  return (
    <span className={cn('font-medium', SENTIMENT_CLASS[sentiment])} data-sentiment={sentiment}>
      {formatAbsoluteChange(metric, value)}
    </span>
  );
}
