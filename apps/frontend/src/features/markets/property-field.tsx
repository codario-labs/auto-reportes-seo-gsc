import { propertyDisplayName, type PropertyVerificationDTO } from '@codario/shared';
import { CircleAlert, CircleCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { InlineNotice } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NONE_VALUE, Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGoogleProperties, useIntegrations, useSyncProperties, useVerifyProperty } from '@/features/api-hooks';
import { errorMessage } from '@/lib/api';
import { PropertyTypeBadge } from './property-label';

interface PropertyFieldProps {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  invalid?: boolean;
}

/** Selección de la propiedad de Search Console de la cuenta conectada (con verificación de acceso). */
export function PropertyField({ id, value, onChange, invalid }: PropertyFieldProps) {
  const integrations = useIntegrations();
  const connected = integrations.data?.google.connected ?? false;
  const properties = useGoogleProperties(connected);
  const sync = useSyncProperties();
  const verify = useVerifyProperty();
  const [verification, setVerification] = useState<PropertyVerificationDTO | null>(null);

  if (integrations.isPending) {
    return <Input id={id} disabled placeholder="Checking Google connection…" />;
  }

  if (!connected) {
    return (
      <div className="grid gap-2">
        <Input
          id={id}
          value={value ?? ''}
          placeholder="sc-domain:example.com or https://www.example.com/"
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value.trim() || null)}
        />
        <InlineNotice tone="neutral">
          Google Search Console is not connected, so properties can't be listed or verified.{' '}
          <Link to="/integrations" className="font-medium text-ink underline underline-offset-2">
            Connect it in Integrations
          </Link>
        </InlineNotice>
      </div>
    );
  }

  const list = properties.data ?? [];
  const valueInList = !value || list.some((p) => p.siteUrl === value);

  return (
    <div className="grid gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={value ?? NONE_VALUE}
          onValueChange={(next) => {
            setVerification(null);
            onChange(next === NONE_VALUE ? null : next);
          }}
          disabled={properties.isPending}
        >
          <SelectTrigger id={id} aria-invalid={invalid || undefined} className="sm:flex-1">
            <SelectValue placeholder={properties.isPending ? 'Loading properties…' : 'Select a property'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>No property</SelectItem>
            <SelectSeparator />
            {list.map((property) => (
              <SelectItem key={property.id} value={property.siteUrl}>
                <span className="flex items-center gap-2">
                  {property.displayName}
                  <PropertyTypeBadge siteUrl={property.siteUrl} />
                  <span className="text-xs text-muted">{property.permissionLevel}</span>
                </span>
              </SelectItem>
            ))}
            {!valueInList && value ? (
              <SelectItem value={value}>
                {propertyDisplayName(value)} <span className="text-xs text-warning">(not in this account)</span>
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            loading={sync.isPending}
            onClick={() =>
              sync.mutate(undefined, {
                onSuccess: (items) => toast.success(`Properties refreshed (${items.length})`),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            {sync.isPending ? null : <RefreshCw />}
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!value}
            loading={verify.isPending}
            onClick={() =>
              value &&
              verify.mutate(value, {
                onSuccess: setVerification,
                onError: (err) =>
                  setVerification({ siteUrl: value, accessible: false, permissionLevel: null, message: errorMessage(err) }),
              })
            }
          >
            {verify.isPending ? null : <ShieldCheck />}
            Verify access
          </Button>
        </div>
      </div>
      {properties.isSuccess && list.length === 0 ? (
        <p className="text-ui text-muted">The connected account has no Search Console properties. Add the site in Search Console, then refresh.</p>
      ) : null}
      {properties.isError ? <p className="text-ui text-danger">{errorMessage(properties.error)}</p> : null}
      {!valueInList && value ? (
        <InlineNotice tone="warning" icon={CircleAlert}>
          This property is not in the connected account's list. Reports will fail until the account has access to it.
        </InlineNotice>
      ) : null}
      {verification && verification.siteUrl === value ? (
        <InlineNotice tone={verification.accessible ? 'success' : 'danger'} icon={verification.accessible ? CircleCheck : CircleAlert}>
          {verification.message}
          {verification.permissionLevel ? ` (${verification.permissionLevel})` : ''}
        </InlineNotice>
      ) : null}
    </div>
  );
}
