import {
  COVER_STYLES,
  DEFAULT_TEMPLATE_CONFIG,
  FONT_KEYS,
  FONT_OPTIONS,
  METRIC_COLORS,
  METRIC_KEYS,
  METRIC_META,
  REPORT_CHART_KEYS,
  REPORT_CHART_LABELS,
  REPORT_SECTION_KEYS,
  REPORT_SECTION_LABELS,
  templateInputSchema,
  type CoverStyle,
  type FontKey,
  type MetricKey,
  type TemplateConfig,
  type TemplateDTO,
} from '@codario/shared';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ColorField } from '@/components/app/color-field';
import { PageHeader, Panel, PanelHeader } from '@/components/app/panel';
import { ErrorState, InlineNotice } from '@/components/app/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SwitchRow } from '@/components/ui/switch';
import { useCreateTemplate, useResetTemplate, useTemplate, useUpdateTemplate } from '@/features/api-hooks';
import { BackLink } from '@/features/markets/market-form-page';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TemplatePreview } from './template-preview';

interface EditorState {
  name: string;
  description: string;
  config: TemplateConfig;
}

const COVER_LABELS: Record<CoverStyle, { label: string; description: string }> = {
  editorial: { label: 'Editorial', description: 'Large title, generous white space' },
  band: { label: 'Color band', description: 'Primary color band across the top' },
  minimal: { label: 'Minimal', description: 'Logos and title only' },
};

export function TemplateEditorPage() {
  const { id } = useParams();
  const template = useTemplate(id);

  if (!id) {
    return <TemplateEditor initial={{ name: '', description: '', config: DEFAULT_TEMPLATE_CONFIG }} />;
  }
  if (template.isPending) {
    return (
      <div className="grid gap-6" role="status" aria-label="Loading template">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Skeleton className="h-[600px] rounded-panel" />
          <Skeleton className="h-[600px] rounded-panel" />
        </div>
      </div>
    );
  }
  if (template.isError) return <ErrorState error={template.error} onRetry={() => void template.refetch()} />;
  return (
    <TemplateEditor
      key={template.data.id}
      template={template.data}
      initial={{ name: template.data.name, description: template.data.description ?? '', config: template.data.config }}
    />
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Panel>
      <PanelHeader title={title} description={description} />
      <div className="px-5 py-4">{children}</div>
    </Panel>
  );
}

function TemplateEditor({ template, initial }: { template?: TemplateDTO; initial: EditorState }) {
  const navigate = useNavigate();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const reset = useResetTemplate();
  const [state, setState] = useState<EditorState>(initial);
  const [saved, setSaved] = useState<EditorState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const skipBlock = useRef(false);

  const dirty = JSON.stringify(state) !== JSON.stringify(saved);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !skipBlock.current && dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  const config = state.config;
  const setConfig = <K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) =>
    setState((s) => ({ ...s, config: { ...s.config, [key]: value } }));
  const patch = <K extends keyof TemplateConfig>(key: K, value: Partial<TemplateConfig[K]>) =>
    setState((s) => ({
      ...s,
      config: { ...s.config, [key]: { ...(s.config[key] as object), ...(value as object) } as TemplateConfig[K] },
    }));
  const err = (path: string) => errors[path] ?? null;

  const toggleMetric = (metric: MetricKey) => {
    const current = config.trendMetrics;
    if (current.includes(metric)) {
      if (current.length === 1) return;
      setConfig('trendMetrics', current.filter((m) => m !== metric));
    } else {
      setConfig('trendMetrics', METRIC_KEYS.filter((m) => m === metric || current.includes(m)));
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = templateInputSchema.safeParse({
      name: state.name,
      description: state.description.trim() || null,
      config: state.config,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error('Check the highlighted fields');
      return;
    }
    setErrors({});
    const onError = (error: unknown) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) setErrors(error.fieldErrors);
      toast.error(errorMessage(error));
    };
    if (template) {
      update.mutate(
        { id: template.id, input: parsed.data },
        {
          onSuccess: (next) => {
            const nextState = { name: next.name, description: next.description ?? '', config: next.config };
            setState(nextState);
            setSaved(nextState);
            toast.success('Template saved');
          },
          onError,
        },
      );
    } else {
      create.mutate(parsed.data, {
        onSuccess: (created) => {
          skipBlock.current = true;
          toast.success('Template created');
          navigate(`/templates/${created.id}`, { replace: true });
        },
        onError,
      });
    }
  };

  const restoreDefaults = () => {
    if (!template) {
      setState((s) => ({ ...s, config: DEFAULT_TEMPLATE_CONFIG }));
      setConfirmReset(false);
      return;
    }
    reset.mutate(template.id, {
      onSuccess: (next) => {
        const nextState = { name: next.name, description: next.description ?? '', config: next.config };
        setState(nextState);
        setSaved(nextState);
        setConfirmReset(false);
        toast.success('Default settings restored');
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const saving = create.isPending || update.isPending;

  return (
    <>
      <BackLink to="/templates" label="Templates" />
      <PageHeader
        title={template ? template.name : 'New template'}
        description={
          template ? (
            <span className="flex flex-wrap items-center gap-2">
              {template.isDefault ? <Badge variant="ink">Default</Badge> : null}
              {template.isSystem ? <Badge variant="outline">System</Badge> : null}
              Used by {template.marketsCount} market{template.marketsCount === 1 ? '' : 's'}
            </span>
          ) : (
            'Start from the default settings and adjust what you need.'
          )
        }
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmReset(true)}>
              <RotateCcw />
              Restore defaults
            </Button>
            <Button type="submit" form="template-form" loading={saving} disabled={!!template && !dirty}>
              {template ? 'Save template' : 'Create template'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
        <form id="template-form" onSubmit={onSubmit} noValidate className="grid gap-6" aria-label="Template settings">
          <InlineNotice tone="info" icon={ShieldCheck}>
            Codario Labs branding is always included in every report, whatever the template settings.
          </InlineNotice>

          <Section title="Basics">
            <div className="grid gap-4">
              <Field label="Name" htmlFor="tpl-name" error={err('name')}>
                <Input
                  id="tpl-name"
                  value={state.name}
                  aria-invalid={!!err('name') || undefined}
                  onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                />
              </Field>
              <Field label="Description" htmlFor="tpl-description" optional error={err('description')}>
                <Textarea
                  id="tpl-description"
                  rows={2}
                  maxLength={300}
                  value={state.description}
                  onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
                />
              </Field>
            </div>
          </Section>

          <Section title="Colors" description="Primary and secondary drive headings, charts accents and the cover.">
            <div className="grid gap-4 sm:grid-cols-2">
              {(['primary', 'secondary', 'background', 'text'] as const).map((key) => (
                <Field key={key} label={`${key[0]?.toUpperCase()}${key.slice(1)} color`} htmlFor={`tpl-color-${key}`} error={err(`config.colors.${key}`)}>
                  <ColorField
                    id={`tpl-color-${key}`}
                    label={`${key} color`}
                    value={config.colors[key]}
                    invalid={!!err(`config.colors.${key}`)}
                    onChange={(v) => patch('colors', { [key]: v })}
                  />
                </Field>
              ))}
            </div>
            <SwitchRow
              id="tpl-use-market-colors"
              className="mt-3 border-t border-line pt-4"
              label="Use market colors"
              description="Each market's primary and secondary colors replace the template's."
              checked={config.useMarketColors}
              onCheckedChange={(v) => setConfig('useMarketColors', v)}
            />
          </Section>

          <Section title="Typography">
            <div className="grid gap-4 sm:grid-cols-2">
              {(['headingFont', 'bodyFont'] as const).map((key) => (
                <Field key={key} label={key === 'headingFont' ? 'Heading font' : 'Body font'} htmlFor={`tpl-${key}`}>
                  <Select value={config.typography[key]} onValueChange={(v) => patch('typography', { [key]: v as FontKey })}>
                    <SelectTrigger id={`tpl-${key}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_KEYS.map((font) => (
                        <SelectItem key={font} value={font}>
                          {FONT_OPTIONS[font].label}
                          <span className="text-xs text-muted">{FONT_OPTIONS[font].category === 'serif' ? 'Serif' : 'Sans'}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ))}
              <Field label="Base font size" htmlFor="tpl-font-size" error={err('config.typography.baseFontSize')} className="sm:col-span-2">
                <div className="flex items-center gap-3">
                  <input
                    id="tpl-font-size"
                    type="range"
                    min={8.5}
                    max={12}
                    step={0.5}
                    value={config.typography.baseFontSize}
                    onChange={(e) => patch('typography', { baseFontSize: Number(e.target.value) })}
                    className="h-1.5 w-full max-w-xs cursor-pointer accent-ink"
                  />
                  <span className="w-12 text-sm text-ink-2">{config.typography.baseFontSize} pt</span>
                </div>
              </Field>
            </div>
          </Section>

          <Section title="Cover">
            <div className="grid gap-4">
              <div role="radiogroup" aria-label="Cover style" className="grid gap-2 sm:grid-cols-3">
                {COVER_STYLES.map((style) => {
                  const selected = config.cover.style === style;
                  return (
                    <button
                      key={style}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => patch('cover', { style })}
                      className={cn(
                        'grid gap-0.5 rounded-control border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40',
                        selected ? 'border-ink bg-ink/[0.03]' : 'border-line hover:border-line-strong',
                      )}
                    >
                      <span className="text-sm font-medium">{COVER_LABELS[style].label}</span>
                      <span className="text-xs text-muted">{COVER_LABELS[style].description}</span>
                    </button>
                  );
                })}
              </div>
              <Field label="Title" htmlFor="tpl-cover-title" error={err('config.cover.title')}>
                <Input
                  id="tpl-cover-title"
                  value={config.cover.title}
                  maxLength={80}
                  aria-invalid={!!err('config.cover.title') || undefined}
                  onChange={(e) => patch('cover', { title: e.target.value })}
                />
              </Field>
              <Field label="Subtitle" htmlFor="tpl-cover-subtitle" optional error={err('config.cover.subtitle')}>
                <Input id="tpl-cover-subtitle" value={config.cover.subtitle} maxLength={160} onChange={(e) => patch('cover', { subtitle: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="Sections" description="Sections without enough data are left out of the PDF automatically.">
            <div className="divide-y divide-line">
              {REPORT_SECTION_KEYS.map((key) => (
                <SwitchRow
                  key={key}
                  id={`tpl-section-${key}`}
                  label={REPORT_SECTION_LABELS[key].label}
                  description={REPORT_SECTION_LABELS[key].description}
                  checked={config.sections[key]}
                  onCheckedChange={(v) => patch('sections', { [key]: v })}
                />
              ))}
            </div>
          </Section>

          <Section title="Charts">
            <div className="divide-y divide-line">
              {REPORT_CHART_KEYS.map((key) => (
                <SwitchRow
                  key={key}
                  id={`tpl-chart-${key}`}
                  label={REPORT_CHART_LABELS[key]}
                  checked={config.charts[key]}
                  onCheckedChange={(v) => patch('charts', { [key]: v })}
                />
              ))}
            </div>
            <div className="mt-3 grid gap-2 border-t border-line pt-4">
              <p className="text-sm font-medium">Trend chart metrics</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Trend chart metrics">
                {METRIC_KEYS.map((metric) => {
                  const on = config.trendMetrics.includes(metric);
                  return (
                    <button
                      key={metric}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleMetric(metric)}
                      className={cn(
                        'inline-flex h-8 items-center gap-2 rounded-control border px-3 text-ui font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40',
                        on ? 'border-ink text-ink' : 'border-line text-muted hover:border-line-strong',
                      )}
                    >
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: on ? METRIC_COLORS[metric] : '#D3D6DD' }} aria-hidden />
                      {METRIC_META[metric].longLabel}
                    </button>
                  );
                })}
              </div>
              {err('config.trendMetrics') ? <p className="text-ui text-danger">{err('config.trendMetrics')}</p> : null}
            </div>
          </Section>

          <Section title="Header and footer">
            <div className="grid gap-4">
              <SwitchRow id="tpl-header" label="Page header" checked={config.header.enabled} onCheckedChange={(v) => patch('header', { enabled: v })} />
              <Field label="Header text" htmlFor="tpl-header-text" optional error={err('config.header.text')}>
                <Input
                  id="tpl-header-text"
                  value={config.header.text}
                  maxLength={80}
                  disabled={!config.header.enabled}
                  onChange={(e) => patch('header', { text: e.target.value })}
                />
              </Field>
              <SwitchRow
                id="tpl-header-logo"
                label="Show market logo in header"
                checked={config.header.showMarketLogo}
                disabled={!config.header.enabled}
                onCheckedChange={(v) => patch('header', { showMarketLogo: v })}
              />
              <div className="border-t border-line pt-2">
                <SwitchRow id="tpl-footer" label="Page footer" checked={config.footer.enabled} onCheckedChange={(v) => patch('footer', { enabled: v })} />
              </div>
              <Field label="Footer text" htmlFor="tpl-footer-text" optional error={err('config.footer.text')}>
                <Input
                  id="tpl-footer-text"
                  value={config.footer.text}
                  maxLength={120}
                  disabled={!config.footer.enabled}
                  onChange={(e) => patch('footer', { text: e.target.value })}
                />
              </Field>
              <SwitchRow
                id="tpl-footer-pages"
                label="Page numbers"
                checked={config.footer.showPageNumbers}
                disabled={!config.footer.enabled}
                onCheckedChange={(v) => patch('footer', { showPageNumbers: v })}
              />
              <SwitchRow
                id="tpl-footer-date"
                label="Generation date"
                checked={config.footer.showGeneratedDate}
                disabled={!config.footer.enabled}
                onCheckedChange={(v) => patch('footer', { showGeneratedDate: v })}
              />
            </div>
          </Section>

          <Section title="Tables">
            <Field label="Rows per table" htmlFor="tpl-max-rows" hint="Between 5 and 25 rows." error={err('config.tables.maxRows')}>
              <Input
                id="tpl-max-rows"
                type="number"
                min={5}
                max={25}
                className="w-28"
                value={config.tables.maxRows}
                aria-invalid={!!err('config.tables.maxRows') || undefined}
                onChange={(e) => patch('tables', { maxRows: Number(e.target.value) })}
              />
            </Field>
          </Section>
        </form>

        <div className="xl:sticky xl:top-6">
          <TemplatePreview config={config} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Restore default settings?"
        description={
          template
            ? 'All visual settings of this template go back to the defaults and are saved immediately. The name is kept.'
            : 'All settings in this form go back to the defaults.'
        }
        confirmLabel="Restore defaults"
        destructive={false}
        pending={reset.isPending}
        onConfirm={restoreDefaults}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => (!open && blocker.state === 'blocked' ? blocker.reset() : undefined)}
        title="Discard unsaved changes?"
        description="You have changes in this template that haven't been saved."
        confirmLabel="Discard changes"
        onConfirm={() => (blocker.state === 'blocked' ? blocker.proceed() : undefined)}
      />
    </>
  );
}
