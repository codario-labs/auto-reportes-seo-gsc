import {
  formatMetricValue,
  formatMetricValueCompact,
  METRIC_COLORS,
  METRIC_META,
  type MetricKey,
  type TimeseriesPoint,
} from '@codario/shared';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { displayDate, displayDay } from '@/lib/format';

interface ChartRow {
  index: number;
  date: string;
  previousDate: string | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  prev_clicks: number | null;
  prev_impressions: number | null;
  prev_ctr: number | null;
  prev_position: number | null;
}

interface PerformanceChartProps {
  current: TimeseriesPoint[];
  previous: TimeseriesPoint[];
  active: MetricKey[];
  showPrevious: boolean;
  height?: number;
}

function buildRows(current: TimeseriesPoint[], previous: TimeseriesPoint[]): ChartRow[] {
  return current.map((point, index) => {
    const prev = previous[index];
    return {
      index,
      date: point.date,
      previousDate: prev?.date ?? null,
      clicks: point.clicks,
      impressions: point.impressions,
      ctr: point.ctr,
      position: point.position,
      prev_clicks: prev ? prev.clicks : null,
      prev_impressions: prev ? prev.impressions : null,
      prev_ctr: prev ? prev.ctr : null,
      prev_position: prev ? prev.position : null,
    };
  });
}

function ChartTooltip({ active, payload, metrics, showPrevious }: TooltipContentProps<number, string> & { metrics: MetricKey[]; showPrevious: boolean }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  if (!row) return null;
  return (
    <div className="min-w-48 rounded-panel border border-line bg-surface px-3 py-2.5 text-ui shadow-overlay">
      <p className="mb-2 font-medium text-ink">{displayDate(row.date)}</p>
      <div className="grid gap-1.5">
        {metrics.map((metric) => (
          <div key={metric} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-ink-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: METRIC_COLORS[metric] }} aria-hidden />
              {METRIC_META[metric].label}
            </span>
            <span className="font-medium text-ink">{formatMetricValue(metric, row[metric])}</span>
          </div>
        ))}
      </div>
      {showPrevious && row.previousDate ? (
        <div className="mt-2 grid gap-1.5 border-t border-line pt-2">
          <p className="text-xs text-muted">{displayDate(row.previousDate)} (previous)</p>
          {metrics.map((metric) => (
            <div key={metric} className="flex items-center justify-between gap-6 text-muted">
              <span>{METRIC_META[metric].label}</span>
              <span>{formatMetricValue(metric, row[`prev_${metric}`])}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Serie temporal con un eje Y independiente por métrica (posición invertida: arriba es mejor). */
export function PerformanceChart({ current, previous, active, showPrevious, height = 300 }: PerformanceChartProps) {
  const rows = useMemo(() => buildRows(current, previous), [current, previous]);
  const singleMetric = active.length === 1 ? active[0] : null;
  const tickInterval = Math.max(0, Math.ceil(rows.length / 8) - 1);

  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`Performance trend for ${active.map((m) => METRIC_META[m].label).join(', ')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: singleMetric ? 8 : 12, bottom: 0, left: singleMetric ? 0 : 12 }}>
          <CartesianGrid vertical={false} stroke="#ECEEF1" />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => displayDay(value)}
            interval={tickInterval}
            tick={{ fill: '#858B97', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#E4E6EB' }}
            minTickGap={12}
            padding={{ left: 16, right: 16 }}
          />
          {active.map((metric) => (
            <YAxis
              key={metric}
              yAxisId={metric}
              hide={metric !== singleMetric}
              reversed={metric === 'position'}
              domain={metric === 'position' ? ['dataMin - 1', 'dataMax + 1'] : [0, 'auto']}
              allowDecimals={metric !== 'clicks' && metric !== 'impressions'}
              tickFormatter={(value: number) => formatMetricValueCompact(metric, value)}
              tick={{ fill: '#858B97', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
          ))}
          <Tooltip
            cursor={{ stroke: '#D3D6DD', strokeWidth: 1 }}
            content={(props) => (
              <ChartTooltip {...(props as TooltipContentProps<number, string>)} metrics={active} showPrevious={showPrevious} />
            )}
          />
          {active.map((metric) => (
            <Line
              key={metric}
              yAxisId={metric}
              type="monotone"
              dataKey={metric}
              stroke={METRIC_COLORS[metric]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
          {showPrevious
            ? active.map((metric) => (
                <Line
                  key={`prev-${metric}`}
                  yAxisId={metric}
                  type="monotone"
                  dataKey={`prev_${metric}`}
                  stroke={METRIC_COLORS[metric]}
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))
            : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
