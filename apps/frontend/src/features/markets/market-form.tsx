import {
  MARKET_STATUS_LABELS,
  MARKET_STATUSES,
  marketInputSchema,
  type MarketStatus,
} from '@codario/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ColorField } from '@/components/app/color-field';
import { LogoUpload } from '@/components/app/logo-upload';
import { Panel, PanelHeader } from '@/components/app/panel';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { NONE_VALUE, Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTemplates } from '@/features/api-hooks';
import { ApiError } from '@/lib/api';
import { PropertyField } from './property-field';

export interface MarketFormValues {
  name: string;
  domain: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  status: MarketStatus;
  gscSiteUrl: string | null;
  templateId: string | null;
}

export interface MarketFormSubmit {
  input: ReturnType<typeof marketInputSchema.parse>;
  logoFile: File | null;
  removeLogo: boolean;
}

interface MarketFormProps {
  initial: MarketFormValues;
  currentLogoUrl?: string | null;
  submitLabel: string;
  cancelTo: string;
  pending?: boolean;
  /** Errores del servidor (400 VALIDATION_ERROR) para mostrarlos por campo. */
  serverError?: unknown;
  onSubmit: (data: MarketFormSubmit) => void;
}

export function MarketForm({ initial, currentLogoUrl = null, submitLabel, cancelTo, pending, serverError, onSubmit }: MarketFormProps) {
  const templates = useTemplates();
  const [values, setValues] = useState<MarketFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  const serverErrors = serverError instanceof ApiError ? serverError.fieldErrors : {};
  const fieldError = (key: keyof MarketFormValues) => errors[key] ?? serverErrors[key] ?? null;

  const set = <K extends keyof MarketFormValues>(key: K, value: MarketFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: '' }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = marketInputSchema.safeParse({
      ...values,
      description: values.description.trim() || null,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      const first = Object.keys(next)[0];
      if (first) document.getElementById(`market-${first}`)?.focus();
      return;
    }
    setErrors({});
    onSubmit({ input: parsed.data, logoFile, removeLogo });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-6" aria-label="Market">
      <Panel>
        <PanelHeader title="Website" description="The site this market reports on." />
        <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
          <Field label="Name" htmlFor="market-name" error={fieldError('name')}>
            <Input
              id="market-name"
              value={values.name}
              placeholder="Codario Labs"
              aria-invalid={!!fieldError('name') || undefined}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Domain" htmlFor="market-domain" error={fieldError('domain')} hint="Without protocol, e.g. codariolabs.com">
            <Input
              id="market-domain"
              value={values.domain}
              placeholder="example.com"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={!!fieldError('domain') || undefined}
              onChange={(e) => set('domain', e.target.value)}
            />
          </Field>
          <Field label="Description" htmlFor="market-description" error={fieldError('description')} optional className="md:col-span-2">
            <Textarea
              id="market-description"
              value={values.description}
              rows={2}
              maxLength={500}
              placeholder="Context for this market, e.g. the Colombian online store."
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <Field label="Search Console property" htmlFor="market-gscSiteUrl" error={fieldError('gscSiteUrl')} className="md:col-span-2">
            <PropertyField
              id="market-gscSiteUrl"
              value={values.gscSiteUrl}
              invalid={!!fieldError('gscSiteUrl')}
              onChange={(next) => set('gscSiteUrl', next)}
            />
          </Field>
          <Field label="Status" htmlFor="market-status" error={fieldError('status')}>
            <Select value={values.status} onValueChange={(v) => set('status', v as MarketStatus)}>
              <SelectTrigger id="market-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKET_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {MARKET_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Report template" htmlFor="market-templateId" error={fieldError('templateId')}>
            <Select value={values.templateId ?? NONE_VALUE} onValueChange={(v) => set('templateId', v === NONE_VALUE ? null : v)}>
              <SelectTrigger id="market-templateId">
                <SelectValue placeholder={templates.isPending ? 'Loading templates…' : 'Workspace default'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Workspace default</SelectItem>
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
      </Panel>

      <Panel>
        <PanelHeader title="Brand identity" description="Used on the report cover and charts when the template uses market colors." />
        <div className="grid gap-5 px-5 py-5 md:grid-cols-2">
          <Field label="Logo" htmlFor="market-logo" className="md:col-span-2">
            <LogoUpload
              currentUrl={currentLogoUrl}
              file={logoFile}
              onFileChange={(file) => {
                setLogoFile(file);
                if (file) setRemoveLogo(false);
              }}
              removed={removeLogo}
              onRemove={() => setRemoveLogo(true)}
              label="Market logo"
            />
          </Field>
          <Field label="Primary color" htmlFor="market-primaryColor" error={fieldError('primaryColor')}>
            <ColorField
              id="market-primaryColor"
              label="primary color"
              value={values.primaryColor}
              invalid={!!fieldError('primaryColor')}
              onChange={(v) => set('primaryColor', v)}
            />
          </Field>
          <Field label="Secondary color" htmlFor="market-secondaryColor" error={fieldError('secondaryColor')}>
            <ColorField
              id="market-secondaryColor"
              label="secondary color"
              value={values.secondaryColor}
              invalid={!!fieldError('secondaryColor')}
              onChange={(v) => set('secondaryColor', v)}
            />
          </Field>
        </div>
      </Panel>

      {serverError && Object.keys(serverErrors).length === 0 ? (
        <p role="alert" className="text-ui text-danger">
          {serverError instanceof Error ? serverError.message : 'The market could not be saved.'}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="secondary">
          <Link to={cancelTo}>Cancel</Link>
        </Button>
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
