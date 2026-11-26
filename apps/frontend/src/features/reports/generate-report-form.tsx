import {
  comparisonLabel,
  generateReportInputSchema,
  type GenerateReportResponse,
  type MarketDTO,
} from '@codario/shared';
import { Sparkles, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { MarketAvatar } from '@/components/app/market-avatar';
import { PeriodSelector } from '@/components/app/period-selector';
import { periodToInput, resolvePeriodSafe, usePeriodContext, type PeriodValue } from '@/components/app/period-utils';
import { InlineNotice } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch, SwitchRow } from '@/components/ui/switch';
import { useGenerateReport, useIntegrations, useMarkets, useSettings, useTemplates } from '@/features/api-hooks';
import { errorMessage } from '@/lib/api';
import { displayRange } from '@/lib/format';
import { cn } from '@/lib/utils';

const MARKET_TEMPLATE = '__market__';

interface GenerateReportFormProps {
  layout?: 'inline' | 'stacked';
  defaultMarketId?: string | null;
  lockMarket?: boolean;
  onCreated: (response: GenerateReportResponse) => void;
  className?: string;
}

export function GenerateReportForm({ layout = 'stacked', defaultMarketId, lockMarket, onCreated, className }: GenerateReportFormProps) {
  const markets = useMarkets();
  const templates = useTemplates();
  const settings = useSettings();
  const integrations = useIntegrations();
  const generate = useGenerateReport();

  const activeMarkets = (markets.data ?? []).filter((m) => m.status !== 'ARCHIVED');
  const [marketOverride, setMarketOverride] = useState<string | null>(null);
  const [periodOverride, setPeriodOverride] = useState<PeriodValue | null>(null);
  const [templateId, setTemplateId] = useState<string>(MARKET_TEMPLATE);
  const [includeAiOverride, setIncludeAiOverride] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const marketId =
    marketOverride ?? defaultMarketId ?? (activeMarkets.length === 1 ? (activeMarkets[0]?.id ?? '') : '');
  const market: MarketDTO | undefined = markets.data?.find((m) => m.id === marketId);
  const period: PeriodValue = periodOverride ?? { preset: settings.data?.defaultPeriodPreset ?? 'LAST_28_DAYS' };
  const anthropicConfigured = integrations.data?.anthropic.configured ?? false;
  const includeAi = anthropicConfigured && (includeAiOverride ?? true);
  const periodContext = usePeriodContext(market?.gscSiteUrl ? marketId : null);
  const periodCheck = resolvePeriodSafe(period, periodContext);

  const marketTemplateName =
    market?.template?.name ?? templates.data?.find((t) => t.id === settings.data?.defaultTemplateId)?.name ?? templates.data?.find((t) => t.isDefault)?.name;

  const missingProperty = !!market && !market.gscSiteUrl;
  const googleConnected = integrations.data?.google.connected ?? true;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = generateReportInputSchema.safeParse({
      marketId,
      ...periodToInput(period),
      templateId: templateId === MARKET_TEMPLATE ? null : templateId,
      includeAi,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the report options');
      return;
    }
    if (periodCheck.error) {
      setError(periodCheck.error);
      return;
    }
    generate.mutate(parsed.data, {
      onSuccess: (response) => {
        if (response.deduplicated) {
          toast.info('This report is already being generated', { description: 'Showing the run in progress.' });
        } else {
          toast.success('Report generation started');
        }
        onCreated(response);
      },
      onError: (err) => setError(errorMessage(err)),
    });
  };

  const inline = layout === 'inline';

  if (markets.isSuccess && activeMarkets.length === 0) {
    return (
      <InlineNotice tone="neutral" className={className}>
        Create a market first: a market links a website to its Search Console property.{' '}
        <Link to="/markets/new" className="font-medium text-ink underline underline-offset-2">
          New market
        </Link>
      </InlineNotice>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={cn('grid gap-4', className)} aria-label="Generate report">
      <div className={cn('grid gap-4', inline && 'lg:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1fr)_auto] lg:items-end')}>
        <Field label="Market" htmlFor="gen-market">
          <Select value={marketId || undefined} onValueChange={setMarketOverride} disabled={lockMarket || markets.isPending}>
            <SelectTrigger id="gen-market" aria-label="Market">
              <SelectValue placeholder={markets.isPending ? 'Loading markets…' : 'Select a market'} />
            </SelectTrigger>
            <SelectContent>
              {activeMarkets.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex items-center gap-2">
                    <MarketAvatar name={m.name} color={m.primaryColor} logoUrl={m.logoUrl} size="sm" className="size-5 text-[9px]" />
                    {m.name}
                    <span className="text-muted">{m.domain}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Period" htmlFor="gen-period">
          <PeriodSelector
            id="gen-period"
            value={period}
            onChange={setPeriodOverride}
            marketId={market?.gscSiteUrl ? marketId : null}
            triggerClassName={inline ? 'lg:w-44' : undefined}
            hideSummary={inline}
          />
        </Field>

        <Field label="Template" htmlFor="gen-template">
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger id="gen-template" aria-label="Template">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MARKET_TEMPLATE}>
                {market ? `Market default${marketTemplateName ? ` (${marketTemplateName})` : ''}` : 'Market default'}
              </SelectItem>
              {templates.data?.length ? <SelectSeparator /> : null}
              {templates.data?.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {inline ? (
          <Button type="submit" loading={generate.isPending} disabled={missingProperty} className="w-full lg:w-auto">
            <Sparkles />
            Generate report
          </Button>
        ) : null}
      </div>

      {inline ? (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className="text-ui text-muted" data-testid="composer-period">
            {periodCheck.period ? (
              <>
                <span className="text-ink-2">
                  {displayRange(periodCheck.period.current.startDate, periodCheck.period.current.endDate)}
                </span>{' '}
                {comparisonLabel(periodCheck.period, 'en')} (
                {displayRange(periodCheck.period.previous.startDate, periodCheck.period.previous.endDate)})
              </>
            ) : (
              <span className="text-warning">{periodCheck.error}</span>
            )}
          </p>
          <label className={cn('flex items-center gap-2.5 text-ui', !anthropicConfigured && 'text-muted')}>
            <Switch checked={includeAi} disabled={!anthropicConfigured} onCheckedChange={setIncludeAiOverride} />
            <span className="font-medium text-ink">Include AI analysis</span>
            <span className="text-muted">
              {anthropicConfigured ? integrations.data?.anthropic.model : 'ANTHROPIC_API_KEY is not configured'}
            </span>
          </label>
        </div>
      ) : (
        <SwitchRow
          id="gen-ai"
          label="Include AI analysis"
          description={
            anthropicConfigured
              ? `Claude analyzes the Search Console data (${integrations.data?.anthropic.model}).`
              : 'Unavailable: ANTHROPIC_API_KEY is not configured on the server.'
          }
          checked={includeAi}
          disabled={!anthropicConfigured}
          onCheckedChange={setIncludeAiOverride}
        />
      )}

      {missingProperty ? (
        <InlineNotice tone="warning" icon={TriangleAlert}>
          {market?.name} has no Search Console property yet.{' '}
          <Link to={`/markets/${market?.id}/edit`} className="font-medium underline underline-offset-2">
            Assign a property
          </Link>
        </InlineNotice>
      ) : null}
      {!googleConnected && market ? (
        <InlineNotice tone="warning" icon={TriangleAlert}>
          Google Search Console is not connected.{' '}
          <Link to="/integrations" className="font-medium underline underline-offset-2">
            Connect it in Integrations
          </Link>
        </InlineNotice>
      ) : null}
      {error ? (
        <p role="alert" className="text-ui text-danger">
          {error}
        </p>
      ) : null}

      {inline ? null : (
        <div className="flex justify-end">
          <Button type="submit" loading={generate.isPending} disabled={missingProperty}>
            <Sparkles />
            Generate report
          </Button>
        </div>
      )}
    </form>
  );
}
