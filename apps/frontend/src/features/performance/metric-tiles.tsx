import {
  formatAbsoluteChange,
  formatMetricValue,
  formatPercentChange,
  METRIC_COLORS,
  METRIC_KEYS,
  METRIC_META,
  type MetricDelta as MetricDeltaValue,
  type MetricKey,
} from '@codario/shared';
import { ArrowDownRight, ArrowUpRight, Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricTilesProps {
  deltas: MetricDeltaValue[];
  active: MetricKey[];
  onToggle: (metric: MetricKey) => void;
  comparisonText?: string;
}

function deltaText(delta: MetricDeltaValue): string {
  if (delta.absoluteChange === null) return 'No comparison data';
  if ((delta.metric === 'clicks' || delta.metric === 'impressions') && delta.percentChange !== null) {
    return formatPercentChange(delta.percentChange);
  }
  return formatAbsoluteChange(delta.metric, delta.absoluteChange);
}

/**
 * Cuatro indicadores seleccionables (inspirados en la lectura de GSC): cada uno activa o
 * desactiva su serie en el gráfico. Siempre queda al menos una serie activa.
 */
export function MetricTiles({ deltas, active, onToggle, comparisonText }: MetricTilesProps) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-t-panel border-b border-line bg-line lg:grid-cols-4">
      {METRIC_KEYS.map((metric) => {
        const delta = deltas.find((d) => d.metric === metric);
        const isActive = active.includes(metric);
        const color = METRIC_COLORS[metric];
        const Icon = delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus;
        const sentimentClass = !delta
          ? ''
          : isActive
            ? 'text-white/90'
            : delta.sentiment === 'positive'
              ? 'text-success'
              : delta.sentiment === 'negative'
                ? 'text-danger'
                : 'text-muted';
        return (
          <button
            key={metric}
            type="button"
            aria-pressed={isActive}
            onClick={() => onToggle(metric)}
            className={cn(
              'group grid gap-1 px-5 py-4 text-left transition-colors duration-150 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus/60',
              isActive ? 'text-white' : 'bg-surface text-ink hover:bg-subtle',
            )}
            style={isActive ? { backgroundColor: color } : undefined}
          >
            <span className="flex items-center gap-2 text-ui font-medium">
              <span
                aria-hidden
                className={cn(
                  'flex size-3.5 items-center justify-center rounded-[3px] border',
                  isActive ? 'border-white bg-white' : 'border-line-strong',
                )}
              >
                {isActive ? <Check className="size-2.5" strokeWidth={3.5} style={{ color }} /> : null}
              </span>
              {METRIC_META[metric].longLabel}
            </span>
            <span className="text-2xl font-semibold tracking-[-0.02em]">
              {formatMetricValue(metric, delta?.current ?? null)}
            </span>
            {delta ? (
              <span className={cn('inline-flex items-center gap-1 text-xs font-medium', sentimentClass)} data-sentiment={delta.sentiment}>
                {delta.absoluteChange !== null ? <Icon className="size-3.5" aria-hidden /> : null}
                {deltaText(delta)}
                {comparisonText && delta.absoluteChange !== null ? (
                  <span className={cn('hidden font-normal sm:inline', isActive ? 'text-white/70' : 'text-muted')}>{comparisonText}</span>
                ) : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
