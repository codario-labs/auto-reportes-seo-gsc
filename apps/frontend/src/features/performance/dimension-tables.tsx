import {
  countryName,
  deviceLabel,
  formatMetricValue,
  formatPercent,
  METRIC_COLORS,
  searchAppearanceLabel,
  type BreakdownSection,
  type ComparedRow,
  type DimensionAnalysis,
  type OpportunityRow,
  type ReportDataset,
} from '@codario/shared';
import { CircleAlert, Inbox, Monitor, Smartphone, Tablet } from 'lucide-react';
import type * as React from 'react';
import { ChangeCell } from '@/components/app/metric-delta';
import { EmptyState } from '@/components/app/states';
import { SegmentedList, SegmentedTrigger, Tabs, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { displayUrl } from '@/lib/format';
import { cn } from '@/lib/utils';

type SectionLike = Pick<DimensionAnalysis, 'status' | 'message'> | BreakdownSection;

function SectionGuard({
  section,
  noun,
  rows,
  children,
}: {
  section: SectionLike;
  noun: string;
  rows: unknown[];
  children: React.ReactNode;
}) {
  if (section.status === 'error') {
    return (
      <EmptyState
        compact
        icon={CircleAlert}
        title={`Search Console data for ${noun} could not be retrieved`}
        description={section.message ?? 'The request to Search Console failed for this dimension.'}
      />
    );
  }
  if (section.status === 'empty' || rows.length === 0) {
    return (
      <EmptyState
        compact
        icon={Inbox}
        title={section.status === 'empty' ? `Search Console returned no ${noun} for this period` : `No ${noun} match this view`}
        description={section.status === 'empty' ? 'This is a real zero, not a loading error.' : undefined}
      />
    );
  }
  return <>{children}</>;
}

function KeyCell({ value, kind }: { value: string; kind: 'query' | 'page' | 'country' | 'device' | 'appearance' }) {
  if (kind === 'page') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer noopener"
        className="block max-w-[28rem] truncate text-ink hover:underline"
        title={value}
      >
        {displayUrl(value)}
      </a>
    );
  }
  const label =
    kind === 'country' ? countryName(value, 'en') : kind === 'device' ? deviceLabel(value, 'en') : kind === 'appearance' ? searchAppearanceLabel(value, 'en') : value;
  return (
    <span className="block max-w-[28rem] truncate text-ink" title={label}>
      {label}
    </span>
  );
}

export function ComparedRowsTable({
  rows,
  kind,
  keyHeader,
  limit,
  showShare,
}: {
  rows: ComparedRow[];
  kind: 'query' | 'page' | 'country' | 'device' | 'appearance';
  keyHeader: string;
  limit?: number;
  showShare?: boolean;
}) {
  const visible = limit ? rows.slice(0, limit) : rows;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[40%]">{keyHeader}</TableHead>
          {showShare ? <TableHead className="text-right">Share</TableHead> : null}
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead className="text-right">Impressions</TableHead>
          <TableHead className="text-right">CTR</TableHead>
          <TableHead className="text-right">Position</TableHead>
          <TableHead className="text-right">Δ Clicks</TableHead>
          <TableHead className="text-right">Δ Position</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((row) => (
          <TableRow key={row.key}>
            <TableCell>
              <KeyCell value={row.key} kind={kind} />
            </TableCell>
            {showShare ? (
              <TableCell className="text-right">
                <ShareBar value={row.clickShare ?? null} />
              </TableCell>
            ) : null}
            <TableCell className="text-right">{formatMetricValue('clicks', row.current?.clicks ?? null)}</TableCell>
            <TableCell className="text-right">{formatMetricValue('impressions', row.current?.impressions ?? null)}</TableCell>
            <TableCell className="text-right">{formatMetricValue('ctr', row.current?.ctr ?? null)}</TableCell>
            <TableCell className="text-right">{formatMetricValue('position', row.current?.position ?? null)}</TableCell>
            <TableCell className="text-right">
              <ChangeCell metric="clicks" value={row.change.clicks} />
            </TableCell>
            <TableCell className="text-right">
              <ChangeCell metric="position" value={row.change.position} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ShareBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-ink/[0.06] sm:block" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, value * 100)}%`, backgroundColor: METRIC_COLORS.clicks }} />
      </span>
      {formatPercent(value, 'en', 1)}
    </span>
  );
}

function OpportunityTable({ rows, kind, limit }: { rows: OpportunityRow[]; kind: 'query' | 'page'; limit?: number }) {
  const visible = limit ? rows.slice(0, limit) : rows;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[40%]">{kind === 'query' ? 'Query' : 'Page'}</TableHead>
          <TableHead className="text-right">Impressions</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead className="text-right">CTR</TableHead>
          <TableHead className="text-right">Site CTR at this position</TableHead>
          <TableHead className="text-right">Position</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((row) => (
          <TableRow key={row.key}>
            <TableCell>
              <KeyCell value={row.key} kind={kind} />
            </TableCell>
            <TableCell className="text-right">{formatMetricValue('impressions', row.impressions)}</TableCell>
            <TableCell className="text-right">{formatMetricValue('clicks', row.clicks)}</TableCell>
            <TableCell className="text-right">{formatMetricValue('ctr', row.ctr)}</TableCell>
            <TableCell className="text-right text-muted">{formatMetricValue('ctr', row.benchmarkCtr)}</TableCell>
            <TableCell className="text-right">{formatMetricValue('position', row.position)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const DEVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  DESKTOP: Monitor,
  MOBILE: Smartphone,
  TABLET: Tablet,
};

/** Reparto por dispositivo en barras horizontales (participación de clics e impresiones). */
export function DeviceBreakdown({ section }: { section: BreakdownSection }) {
  const totalImpressions = section.rows.reduce((sum, r) => sum + (r.current?.impressions ?? 0), 0);
  return (
    <SectionGuard section={section} noun="devices" rows={section.rows}>
      <div className="grid gap-5 px-5 py-5">
        {section.rows.map((row) => {
          const Icon = DEVICE_ICONS[row.key.toUpperCase()] ?? Monitor;
          const clickShare = row.clickShare ?? null;
          const impressionShare =
            row.impressionShare ?? (totalImpressions > 0 && row.current ? row.current.impressions / totalImpressions : null);
          return (
            <div key={row.key} className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-4 text-muted" />
                  {deviceLabel(row.key, 'en')}
                </span>
                <span className="text-ui text-ink-2">
                  {formatMetricValue('clicks', row.current?.clicks ?? null)} clicks,{' '}
                  {formatMetricValue('impressions', row.current?.impressions ?? null)} impressions, CTR{' '}
                  {formatMetricValue('ctr', row.current?.ctr ?? null)}, position {formatMetricValue('position', row.current?.position ?? null)}
                </span>
              </div>
              <ShareTrack label="Clicks" value={clickShare} color={METRIC_COLORS.clicks} />
              <ShareTrack label="Impressions" value={impressionShare} color={METRIC_COLORS.impressions} />
            </div>
          );
        })}
      </div>
    </SectionGuard>
  );
}

function ShareTrack({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr_3.5rem] items-center gap-3 text-xs text-muted">
      <span>{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
        <span className="block h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.min(100, (value ?? 0) * 100)}%`, backgroundColor: color }} />
      </span>
      <span className="text-right text-ink-2">{value === null ? '—' : formatPercent(value, 'en', 1)}</span>
    </div>
  );
}

interface DimensionTablesProps {
  dataset: ReportDataset;
  limit?: number;
  className?: string;
}

/** Tablas por dimensión con sus estados (datos, cero real o error). */
export function DimensionTables({ dataset, limit = 25, className }: DimensionTablesProps) {
  const { queries, pages, countries, devices, searchAppearance } = dataset;
  const tabs: { value: string; label: string; content: React.ReactNode }[] = [
    {
      value: 'queries',
      label: 'Top queries',
      content: (
        <SectionGuard section={queries} noun="queries" rows={queries.top}>
          <ComparedRowsTable rows={queries.top} kind="query" keyHeader="Query" limit={limit} />
        </SectionGuard>
      ),
    },
    {
      value: 'pages',
      label: 'Top pages',
      content: (
        <SectionGuard section={pages} noun="pages" rows={pages.top}>
          <ComparedRowsTable rows={pages.top} kind="page" keyHeader="Page" limit={limit} />
        </SectionGuard>
      ),
    },
    {
      value: 'countries',
      label: 'Countries',
      content: (
        <SectionGuard section={countries} noun="countries" rows={countries.rows}>
          <ComparedRowsTable rows={countries.rows} kind="country" keyHeader="Country" limit={limit} showShare />
        </SectionGuard>
      ),
    },
    { value: 'devices', label: 'Devices', content: <DeviceBreakdown section={devices} /> },
    {
      value: 'rising-queries',
      label: 'Rising queries',
      content: (
        <SectionGuard section={queries} noun="rising queries" rows={queries.gainers}>
          <ComparedRowsTable rows={queries.gainers} kind="query" keyHeader="Query" limit={limit} />
        </SectionGuard>
      ),
    },
    {
      value: 'declining-queries',
      label: 'Declining queries',
      content: (
        <SectionGuard section={queries} noun="declining queries" rows={queries.losers}>
          <ComparedRowsTable rows={queries.losers} kind="query" keyHeader="Query" limit={limit} />
        </SectionGuard>
      ),
    },
    {
      value: 'rising-pages',
      label: 'Rising pages',
      content: (
        <SectionGuard section={pages} noun="rising pages" rows={pages.gainers}>
          <ComparedRowsTable rows={pages.gainers} kind="page" keyHeader="Page" limit={limit} />
        </SectionGuard>
      ),
    },
    {
      value: 'declining-pages',
      label: 'Declining pages',
      content: (
        <SectionGuard section={pages} noun="declining pages" rows={pages.losers}>
          <ComparedRowsTable rows={pages.losers} kind="page" keyHeader="Page" limit={limit} />
        </SectionGuard>
      ),
    },
    {
      value: 'low-ctr',
      label: 'Low CTR queries',
      content: (
        <SectionGuard section={queries} noun="low-CTR queries" rows={queries.lowCtr}>
          <OpportunityTable rows={queries.lowCtr} kind="query" limit={limit} />
        </SectionGuard>
      ),
    },
    {
      value: 'near-page-one',
      label: 'Near page one',
      content: (
        <SectionGuard section={queries} noun="queries near page one" rows={queries.strikingDistance}>
          <OpportunityTable rows={queries.strikingDistance} kind="query" limit={limit} />
        </SectionGuard>
      ),
    },
  ];

  if (searchAppearance.status !== 'empty' || searchAppearance.rows.length > 0) {
    tabs.push({
      value: 'appearance',
      label: 'Search appearance',
      content: (
        <SectionGuard section={searchAppearance} noun="search appearance types" rows={searchAppearance.rows}>
          <ComparedRowsTable rows={searchAppearance.rows} kind="appearance" keyHeader="Appearance" limit={limit} />
        </SectionGuard>
      ),
    });
  }

  return (
    <Tabs defaultValue="queries" className={cn('grid min-w-0', className)}>
      <div className="min-w-0 border-b border-line px-5 py-3">
        <SegmentedList aria-label="Breakdown">
          {tabs.map((tab) => (
            <SegmentedTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </SegmentedTrigger>
          ))}
        </SegmentedList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="pt-0">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
