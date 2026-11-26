import {
  formatMetricValue,
  METRIC_META,
  OVERALL_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_LEVELS,
  ROADMAP_HORIZON_LABELS,
  ROADMAP_HORIZONS,
  type AiAnalysis,
  type AiFinding,
  type MetricValues,
  type PriorityLevel,
  type ReportDataset,
  type ReportRecommendationDTO,
} from '@codario/shared';
import type * as React from 'react';
import { Panel, PanelHeader } from '@/components/app/panel';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { displayUrl } from '@/lib/format';
import { cn } from '@/lib/utils';

const PRIORITY_BADGE: Record<PriorityLevel, BadgeProps['variant']> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

const STATUS_BADGE: Record<AiAnalysis['executiveSummary']['overallStatus'], BadgeProps['variant']> = {
  positive: 'success',
  stable: 'neutral',
  mixed: 'warning',
  negative: 'danger',
  insufficient_data: 'outline',
};

function BulletList({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return empty ? <p className="text-ui text-muted">{empty}</p> : null;
  return (
    <ul className="grid gap-1.5 text-sm text-ink-2">
      {items.map((item, i) => (
        <li key={i} className="relative pl-4 before:absolute before:left-0 before:top-[0.6em] before:size-1.5 before:rounded-full before:bg-line-strong">
          {item}
        </li>
      ))}
    </ul>
  );
}

function Chips({ values, kind }: { values: string[]; kind: 'query' | 'page' }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span key={value} className="max-w-full truncate rounded-[5px] border border-line bg-subtle px-1.5 py-0.5 text-xs text-ink-2" title={value}>
          {kind === 'page' ? displayUrl(value) : value}
        </span>
      ))}
    </div>
  );
}

function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('max-w-[72ch] whitespace-pre-line text-sm leading-relaxed text-ink-2', className)}>{children}</p>;
}

function Findings({ findings }: { findings: AiFinding[] }) {
  if (findings.length === 0) return <p className="text-ui text-muted">No specific findings for this section.</p>;
  return (
    <ul className="grid divide-y divide-line">
      {findings.map((finding, i) => (
        <li key={i} className="grid gap-2 py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink">{finding.title}</p>
            <Badge variant={finding.kind === 'fact' ? 'neutral' : 'outline'}>{finding.kind === 'fact' ? 'Fact' : 'Hypothesis'}</Badge>
          </div>
          <Prose>{finding.detail}</Prose>
          <Chips values={finding.relatedQueries} kind="query" />
          <Chips values={finding.relatedPages} kind="page" />
        </li>
      ))}
    </ul>
  );
}

function lookupMetrics(dataset: ReportDataset | null, target: string, type: 'query' | 'page'): MetricValues | null {
  if (!dataset) return null;
  const section = type === 'query' ? dataset.queries : dataset.pages;
  const opportunity = [...section.lowCtr, ...section.strikingDistance].find((row) => row.key === target);
  if (opportunity) return opportunity;
  const compared = [...section.top, ...section.gainers, ...section.losers].find((row) => row.key === target);
  return compared?.current ?? null;
}

interface AnalysisViewProps {
  analysis: AiAnalysis;
  recommendations: ReportRecommendationDTO[];
  dataset: ReportDataset | null;
}

/** Análisis SEO generado por IA (contenido en español, tal como aparece en el PDF). */
export function AnalysisView({ analysis, recommendations, dataset }: AnalysisViewProps) {
  const summary = analysis.executiveSummary;
  const recs: ReportRecommendationDTO[] =
    recommendations.length > 0
      ? recommendations
      : analysis.recommendations.map((r, i) => ({ id: String(i), ...r }));

  return (
    <div className="grid gap-6" lang="es">
      <Panel>
        <PanelHeader
          title="Executive summary"
          actions={<Badge variant={STATUS_BADGE[summary.overallStatus]}>{OVERALL_STATUS_LABELS[summary.overallStatus].en}</Badge>}
        />
        <div className="grid gap-6 px-5 py-5">
          <div className="grid gap-3">
            <p className="max-w-[60ch] text-lg font-semibold leading-snug tracking-[-0.01em] text-ink">{summary.headline}</p>
            <Prose>{summary.overview}</Prose>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid content-start gap-2">
              <h3 className="text-ui font-medium text-ink">Key results</h3>
              <BulletList items={summary.keyResults} empty="None reported." />
            </div>
            <div className="grid content-start gap-2">
              <h3 className="text-ui font-medium text-ink">Relevant changes</h3>
              <BulletList items={summary.relevantChanges} empty="None reported." />
            </div>
            <div className="grid content-start gap-2">
              <h3 className="text-ui font-medium text-ink">Issues detected</h3>
              <BulletList items={summary.detectedIssues} empty="No issues detected." />
            </div>
            <div className="grid content-start gap-2">
              <h3 className="text-ui font-medium text-ink">Opportunities</h3>
              <BulletList items={summary.opportunities} empty="None reported." />
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Performance analysis" />
        <div className="grid gap-5 px-5 py-5">
          <div className="grid gap-5 md:grid-cols-2">
            {(['clicks', 'impressions', 'ctr', 'position'] as const).map((metric) => (
              <div key={metric} className="grid content-start gap-1.5">
                <h3 className="text-ui font-medium text-ink">{METRIC_META[metric].longLabel}</h3>
                <Prose>{analysis.performanceAnalysis[metric]}</Prose>
              </div>
            ))}
          </div>
          <div className="grid gap-1.5 border-t border-line pt-5">
            <h3 className="text-ui font-medium text-ink">Synthesis</h3>
            <Prose>{analysis.performanceAnalysis.synthesis}</Prose>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Keyword analysis" />
          <div className="grid gap-4 px-5 py-5">
            <Prose>{analysis.keywordAnalysis.summary}</Prose>
            <Findings findings={analysis.keywordAnalysis.findings} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Page analysis" />
          <div className="grid gap-4 px-5 py-5">
            <Prose>{analysis.pageAnalysis.summary}</Prose>
            <Findings findings={analysis.pageAnalysis.findings} />
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="CTR opportunities" description="Suggestions are hypotheses: titles and descriptions were not fetched from the pages." />
        <div className="grid gap-4 px-5 py-5">
          <Prose>{analysis.ctrOpportunities.summary}</Prose>
          {analysis.ctrOpportunities.items.length === 0 ? (
            <p className="text-ui text-muted">No CTR opportunities identified.</p>
          ) : (
            <ul className="grid divide-y divide-line">
              {analysis.ctrOpportunities.items.map((item, i) => {
                const metrics = lookupMetrics(dataset, item.target, item.targetType);
                return (
                  <li key={i} className="grid gap-2 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{item.targetType === 'query' ? 'Query' : 'Page'}</Badge>
                      <p className="min-w-0 truncate text-sm font-medium text-ink" title={item.target}>
                        {item.targetType === 'page' ? displayUrl(item.target) : item.target}
                      </p>
                    </div>
                    {metrics ? (
                      <p className="text-xs text-muted">
                        {formatMetricValue('impressions', metrics.impressions)} impressions, {formatMetricValue('clicks', metrics.clicks)} clicks, CTR{' '}
                        {formatMetricValue('ctr', metrics.ctr)}, position {formatMetricValue('position', metrics.position)}
                      </p>
                    ) : null}
                    <Prose>{item.observation}</Prose>
                    <BulletList items={item.suggestedActions} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Recommendations" description="Prioritized actions with the evidence behind each one." />
        <div className="grid gap-0 px-5 py-2">
          {recs.length === 0 ? <p className="py-4 text-ui text-muted">No recommendations.</p> : null}
          {PRIORITY_LEVELS.map((priority) => {
            const group = recs.filter((r) => r.priority === priority);
            if (group.length === 0) return null;
            return (
              <section key={priority} className="grid gap-3 border-b border-line py-4 last:border-0">
                <h3 className="flex items-center gap-2 text-ui font-medium text-ink">
                  <Badge variant={PRIORITY_BADGE[priority]}>{PRIORITY_LABELS[priority].en}</Badge>
                  {group.length} recommendation{group.length === 1 ? '' : 's'}
                </h3>
                <ol className="grid gap-4">
                  {group.map((rec) => (
                    <li key={rec.id} className="grid gap-3 rounded-panel border border-line p-4">
                      <p className="text-sm font-semibold text-ink">{rec.title}</p>
                      <dl className="grid gap-3 text-sm md:grid-cols-2">
                        {(
                          [
                            ['Problem', rec.problem],
                            ['Evidence', rec.evidence],
                            ['Potential impact', rec.potentialImpact],
                            ['Recommended action', rec.action],
                          ] as const
                        ).map(([label, value]) => (
                          <div key={label} className="grid content-start gap-0.5">
                            <dt className="text-xs text-muted">{label}</dt>
                            <dd className="text-ink-2">{value}</dd>
                          </div>
                        ))}
                        <div className="grid content-start gap-0.5 md:col-span-2">
                          <dt className="text-xs text-muted">Justification</dt>
                          <dd className="text-ink-2">{rec.justification}</dd>
                        </div>
                      </dl>
                      <Chips values={rec.relatedQueries} kind="query" />
                      <Chips values={rec.relatedPages} kind="page" />
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Growth opportunities" />
          <div className="px-5 py-5">
            {analysis.opportunities.length === 0 ? (
              <p className="text-ui text-muted">No additional opportunities identified.</p>
            ) : (
              <ul className="grid divide-y divide-line">
                {analysis.opportunities.map((o, i) => (
                  <li key={i} className="grid gap-1.5 py-4 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-ink">{o.title}</p>
                    <Prose>{o.description}</Prose>
                    <p className="text-ui text-muted">{o.evidence}</p>
                    <Chips values={o.relatedQueries} kind="query" />
                    <Chips values={o.relatedPages} kind="page" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Conclusions and roadmap" />
          <div className="grid gap-5 px-5 py-5">
            <Prose>{analysis.conclusions.summary}</Prose>
            {ROADMAP_HORIZONS.map((horizon) => {
              const items = analysis.conclusions.roadmap.filter((r) => r.horizon === horizon);
              if (items.length === 0) return null;
              return (
                <div key={horizon} className="grid gap-2">
                  <h3 className="text-ui font-medium text-ink">{ROADMAP_HORIZON_LABELS[horizon].en}</h3>
                  <BulletList items={items.map((r) => r.action)} />
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {analysis.dataLimitations.length > 0 ? (
        <Panel>
          <PanelHeader title="Data limitations" description="What the analysis could not verify with the available data." />
          <div className="px-5 py-5">
            <BulletList items={analysis.dataLimitations} />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
