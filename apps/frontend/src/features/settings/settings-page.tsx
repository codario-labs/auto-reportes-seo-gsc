import {
  COMMON_TIMEZONES,
  PERIOD_PRESET_LABELS,
  PERIOD_PRESETS,
  settingsUpdateSchema,
  type PeriodPreset,
  type SettingsDTO,
} from '@codario/shared';
import { Trash2, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { LOGO_ACCEPTED_TYPES, validateLogoFile } from '@/components/app/logo-validation';
import { PageHeader, Panel, PanelHeader } from '@/components/app/panel';
import { ErrorState } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/misc';
import { NONE_VALUE, Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDeleteGlobalLogo, useSettings, useTemplates, useUpdateSettings, useUploadGlobalLogo } from '@/features/api-hooks';
import { ApiError, errorMessage } from '@/lib/api';

const OTHER_TZ = '__other__';

export function SettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader title="Settings" description="Workspace defaults and the Codario Labs brand used on every report." />
      {settings.isPending ? (
        <div className="grid gap-6" role="status" aria-label="Loading settings">
          <Skeleton className="h-80 w-full rounded-panel" />
          <Skeleton className="h-40 w-full rounded-panel" />
        </div>
      ) : settings.isError ? (
        <Panel>
          <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
        </Panel>
      ) : (
        <div className="grid gap-6">
          <SettingsForm key={settings.data.updatedAt} settings={settings.data} />
          <GlobalLogo settings={settings.data} />
        </div>
      )}
    </>
  );
}

interface FormState {
  companyName: string;
  timezone: string;
  defaultPeriodPreset: Exclude<PeriodPreset, 'CUSTOM'>;
  dataDelayDays: number;
  defaultTemplateId: string | null;
}

function SettingsForm({ settings }: { settings: SettingsDTO }) {
  const templates = useTemplates();
  const update = useUpdateSettings();
  const [state, setState] = useState<FormState>({
    companyName: settings.companyName,
    timezone: settings.timezone,
    defaultPeriodPreset: settings.defaultPeriodPreset,
    dataDelayDays: settings.dataDelayDays,
    defaultTemplateId: settings.defaultTemplateId,
  });
  const knownTz = (COMMON_TIMEZONES as readonly string[]).includes(state.timezone);
  const [customTz, setCustomTz] = useState(!knownTz);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((s) => ({ ...s, [key]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = settingsUpdateSchema.safeParse(state);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    update.mutate(parsed.data, {
      onSuccess: () => toast.success('Settings saved'),
      onError: (err) => {
        if (err instanceof ApiError) setErrors(err.fieldErrors);
        toast.error(errorMessage(err));
      },
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Workspace settings">
      <Panel>
        <PanelHeader title="Workspace" />
        <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
          <Field label="Company name" htmlFor="settings-company" error={errors.companyName}>
            <Input id="settings-company" value={state.companyName} onChange={(e) => set('companyName', e.target.value)} />
          </Field>
          <Field
            label="Time zone"
            htmlFor="settings-timezone"
            error={errors.timezone}
            hint="Used to decide what 'today' is when resolving periods. Search Console itself reports in Pacific Time."
          >
            <div className="grid gap-2">
              <Select
                value={customTz ? OTHER_TZ : state.timezone}
                onValueChange={(v) => {
                  if (v === OTHER_TZ) setCustomTz(true);
                  else {
                    setCustomTz(false);
                    set('timezone', v);
                  }
                }}
              >
                <SelectTrigger id="settings-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value={OTHER_TZ}>Other IANA time zone</SelectItem>
                </SelectContent>
              </Select>
              {customTz ? (
                <Input
                  aria-label="IANA time zone"
                  placeholder="e.g. America/Guayaquil"
                  value={state.timezone}
                  onChange={(e) => set('timezone', e.target.value.trim())}
                  aria-invalid={!!errors.timezone || undefined}
                />
              ) : null}
            </div>
          </Field>
          <Field label="Default period" htmlFor="settings-period" error={errors.defaultPeriodPreset}>
            <Select value={state.defaultPeriodPreset} onValueChange={(v) => set('defaultPeriodPreset', v as FormState['defaultPeriodPreset'])}>
              <SelectTrigger id="settings-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_PRESETS.filter((p) => p !== 'CUSTOM').map((p) => (
                  <SelectItem key={p} value={p}>
                    {PERIOD_PRESET_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Data delay (days)"
            htmlFor="settings-delay"
            error={errors.dataDelayDays}
            hint="Search Console finalizes data with a 2–3 day lag. Used only when the latest date can't be read from Search Console."
          >
            <Input
              id="settings-delay"
              type="number"
              min={1}
              max={7}
              className="w-28"
              value={state.dataDelayDays}
              onChange={(e) => set('dataDelayDays', Number(e.target.value))}
            />
          </Field>
          <Field label="Default template" htmlFor="settings-template" error={errors.defaultTemplateId} hint="Used by markets without their own template.">
            <Select value={state.defaultTemplateId ?? NONE_VALUE} onValueChange={(v) => set('defaultTemplateId', v === NONE_VALUE ? null : v)}>
              <SelectTrigger id="settings-template">
                <SelectValue placeholder="System default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>System default</SelectItem>
                {templates.data?.length ? <SelectSeparator /> : null}
                {templates.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end border-t border-line px-5 py-3">
          <Button type="submit" loading={update.isPending}>
            Save settings
          </Button>
        </div>
      </Panel>
    </form>
  );
}

function GlobalLogo({ settings }: { settings: SettingsDTO }) {
  const upload = useUploadGlobalLogo();
  const remove = useDeleteGlobalLogo();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel>
      <PanelHeader
        title="Codario Labs logo"
        description="Appears on the cover and footer of every PDF, whatever the market or template."
      />
      <div className="flex flex-wrap items-center gap-5 px-5 py-5">
        <div className="flex h-20 w-48 items-center justify-center rounded-panel border border-dashed border-line-strong bg-subtle p-3">
          {settings.globalLogoUrl ? (
            <img src={settings.globalLogoUrl} alt="Codario Labs logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-center text-ui text-muted">No logo uploaded. Reports show the company name as text.</span>
          )}
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept={LOGO_ACCEPTED_TYPES.join(',')}
              aria-label="Upload Codario Labs logo"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const problem = validateLogoFile(file);
                setError(problem);
                if (problem) return;
                upload.mutate(file, {
                  onSuccess: () => toast.success('Logo uploaded'),
                  onError: (err) => setError(errorMessage(err)),
                });
              }}
            />
            <Button variant="secondary" loading={upload.isPending} onClick={() => inputRef.current?.click()}>
              {upload.isPending ? null : <Upload />}
              {settings.globalLogoUrl ? 'Replace logo' : 'Upload logo'}
            </Button>
            {settings.globalLogoSource === 'upload' ? (
              <Button
                variant="ghost"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(undefined, {
                    onSuccess: () => toast.success('Logo removed'),
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
              >
                {remove.isPending ? null : <Trash2 />}
                Remove
              </Button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-ui text-danger">
              {error}
            </p>
          ) : (
            <p className="text-ui text-muted">
              {settings.globalLogoSource === 'env'
                ? 'Currently loaded from CODARIO_LOGO_PATH. An uploaded logo takes precedence.'
                : 'PNG, JPEG, WebP or SVG, up to 2 MB. Use the official file.'}
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
