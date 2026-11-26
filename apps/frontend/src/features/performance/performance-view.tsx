import {
  comparisonLabel,
  formatDataIssue,
  formatPeriodNote,
  propertyDisplayName,
  type MetricKey,
  type ReportDataset,
} from '@codario/shared';
import { Info, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Panel, PanelHeader } from '@/components/app/panel';
import { InlineNotice } from '@/components/app/states';
import { Switch } from '@/components/ui/switch';
import { displayDate, displayDateTime, displayRange } from '@/lib/format';
import { DimensionTables } from './dimension-tables';
import { MetricTiles } from './metric-tiles';
import { PerformanceChart } from './performance-chart';

interface PerformanceViewProps {
  dataset: ReportDataset;
  tableLimit?: number;
  /** Indica que los datos se están actualizando (p. ej. cambio de periodo). */
  refreshing?: boolean;
}

export function PerformanceView({ dataset, tableLimit = 25, refreshing }: PerformanceViewProps) {
  const [active, setActive] = useState<MetricKey[]>(['clicks', 'impressions']);
  const [showPrevious, setShowPrevious] = useState(false);
  const { period } = dataset;
  const canCompare = period.previousAvailability !== 'unavailable' && dataset.timeseries.previous.length > 0;

  const toggle = (metric: MetricKey) => {
    setActive((current) => {
      if (current.includes(metric)) return current.length === 1 ? current : current.filter((m) => m !== metric);
      return [...current, metric];
    });
  };

  const warnings = dataset.dataQuality.issues.filter((i) => i.severity === 'warning');
  const infos = dataset.dataQuality.issues.filter((i) => i.severity !== 'warning');

  return (
    <div className="grid min-w-0 gap-6" aria-busy={refreshing || undefined}>
      {!dataset.dataQuality.hasData ? (
        <InlineNotice tone="warning" icon={TriangleAlert}>
          Search Console returned no impressions for this period. The property is reachable, but there is no search
          traffic recorded between {displayDate(period.current.startDate)} and {displayDate(period.current.endDate)}.
        </InlineNotice>
      ) : null}

      <Panel className={refreshing ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
        <MetricTiles
          deltas={dataset.totals.deltas}
          active={active}
          onToggle={toggle}
          comparisonText={comparisonLabel(period, 'en')}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <p className="text-ui text-ink-2">
            {displayRange(period.current.startDate, period.current.endDate)}
            <span className="text-muted"> ({period.days} days)</span>
          </p>
          <label className="flex items-center gap-2 text-ui text-ink-2">
            <Switch
              checked={showPrevious && canCompare}
              disabled={!canCompare}
              onCheckedChange={setShowPrevious}
              aria-label="Compare to previous period"
            />
            Compare to previous period
          </label>
        </div>
        <div className="px-2 pb-4 pt-2 sm:px-4">
          <PerformanceChart
            current={dataset.timeseries.current}
            previous={dataset.timeseries.previous}
            active={active}
            showPrevious={showPrevious && canCompare}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Breakdown" description="Rows come directly from Search Console for the selected period." />
        <DimensionTables dataset={dataset} limit={tableLimit} />
      </Panel>

      <DataNotes dataset={dataset} warnings={warnings.map((i) => formatDataIssue(i, 'en'))} infos={infos.map((i) => formatDataIssue(i, 'en'))} />
    </div>
  );
}

function DataNotes({ dataset, warnings, infos }: { dataset: ReportDataset; warnings: string[]; infos: string[] }) {
  const { period, freshness, property } = dataset;
  const notes = period.notes.map((note) => formatPeriodNote(note, 'en'));
  return (
    <Panel>
      <PanelHeader title="Data notes" description="How this data was collected and what it does not cover." />
      <div className="grid gap-3 px-5 py-4">
        {warnings.map((text) => (
          <InlineNotice key={text} tone="warning" icon={TriangleAlert}>
            {text}
          </InlineNotice>
        ))}
        <ul className="grid gap-1.5 text-ui text-ink-2">
          <li>
            Property <span className="text-ink">{propertyDisplayName(property.siteUrl)}</span> (
            {property.propertyType === 'DOMAIN' ? 'domain property' : 'URL-prefix property'}).
          </li>
          <li>
            Finalized data through {displayDate(freshness.latestAvailableDate)}
            {freshness.source === 'estimated' ? ' (estimated from the configured data delay)' : ' (reported by Search Console)'}
            , checked {displayDateTime(freshness.checkedAt)}.
          </li>
          <li>
            Comparison period {displayRange(period.previous.startDate, period.previous.endDate)}
            {period.previousAvailability === 'partial'
              ? ', partially covered by the 16-month retention.'
              : period.previousAvailability === 'unavailable'
                ? ', outside the 16-month retention.'
                : '.'}
          </li>
          {notes.map((text) => (
            <li key={text}>{text}</li>
          ))}
          {infos.map((text) => (
            <li key={text} className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
              {text}
            </li>
          ))}
          <li className="text-muted">
            {dataset.stats.gscRequests} Search Console requests, {dataset.stats.rowsFetched.toLocaleString('en-US')} rows fetched.
          </li>
        </ul>
      </div>
    </Panel>
  );
}
