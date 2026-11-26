import type { GoogleIntegrationStatusDTO, IntegrationsStatusDTO, PropertyVerificationDTO } from '@codario/shared';
import { CircleAlert, CircleCheck, Copy, ExternalLink, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { DefinitionList, PageHeader, Panel, PanelHeader } from '@/components/app/panel';
import { EmptyState, ErrorState, InlineNotice, TableSkeleton } from '@/components/app/states';
import { StatusDot } from '@/components/app/status-badge';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useConnectGoogle,
  useDisconnectGoogle,
  useGoogleProperties,
  useIntegrations,
  useSyncProperties,
  useVerifyProperty,
} from '@/features/api-hooks';
import { PropertyTypeBadge } from '@/features/markets/property-label';
import { errorMessage } from '@/lib/api';
import { displayDateTime, displayRelative } from '@/lib/format';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Access was denied on the Google consent screen.',
  invalid_state: 'The connection request expired or was not started from this workspace. Try again.',
  missing_refresh_token: 'Google did not return a refresh token. Remove the app from your Google account permissions and connect again.',
  insufficient_scope: 'The Search Console permission was not granted. Connect again and allow access to Search Console.',
  state_expired: 'The connection request expired. Start the connection again.',
  session_mismatch: 'The connection was completed in a different browser session. Unlock the workspace and try again from this browser.',
  missing_parameters: 'Google returned an incomplete response. Try connecting again.',
  token_exchange_failed: 'Google rejected the authorization code. Check the OAuth client ID, secret and redirect URI, then try again.',
  missing_identity: 'Google did not return the account identity. Try connecting again.',
  google_error: 'Google reported an error during authorization. Try again.',
  unexpected_error: 'The connection could not be completed. Check the server logs and try again.',
};

/** Muestra el resultado del callback OAuth (?google=connected|error&reason=...) y limpia la URL. */
function useOAuthResult() {
  const [params, setParams] = useSearchParams();
  const result = params.get('google');
  const reason = params.get('reason');
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!result) return;
    const key = `${result}:${reason ?? ''}`;
    if (handled.current === key) return;
    handled.current = key;
    if (result === 'connected') toast.success('Google account connected');
    else toast.error('Google account not connected', { description: (reason && OAUTH_ERROR_MESSAGES[reason]) ?? reason ?? undefined });
    const next = new URLSearchParams(params);
    next.delete('google');
    next.delete('reason');
    setParams(next, { replace: true });
  }, [result, reason, params, setParams]);
}

export function IntegrationsPage() {
  useOAuthResult();
  const integrations = useIntegrations();

  return (
    <>
      <PageHeader title="Integrations" description="Search Console provides the data, Anthropic writes the analysis, Chromium renders the PDF." />
      {integrations.isPending ? (
        <div className="grid gap-6" role="status" aria-label="Loading integrations">
          <Skeleton className="h-56 w-full rounded-panel" />
          <Skeleton className="h-40 w-full rounded-panel" />
        </div>
      ) : integrations.isError ? (
        <Panel>
          <ErrorState error={integrations.error} onRetry={() => void integrations.refetch()} />
        </Panel>
      ) : (
        <div className="grid gap-6">
          <GooglePanel google={integrations.data.google} />
          <AnthropicPanel data={integrations.data} />
          <SystemPanel data={integrations.data} />
        </div>
      )}
    </>
  );
}

function CopyValue({ value }: { value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <code className="truncate rounded-[5px] bg-ink/[0.05] px-1.5 py-0.5 text-ui">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Copy"
        onClick={() =>
          void navigator.clipboard
            ?.writeText(value)
            .then(() => toast.success('Copied'))
            .catch(() => toast.error('Could not copy'))
        }
      >
        <Copy />
      </Button>
    </span>
  );
}

function GooglePanel({ google }: { google: GoogleIntegrationStatusDTO }) {
  const connect = useConnectGoogle();
  const disconnect = useDisconnectGoogle();
  const [confirm, setConfirm] = useState(false);
  const tone = google.connected && google.status === 'CONNECTED' ? 'success' : google.connected ? 'danger' : 'neutral';

  const connectButton = (
    <Button loading={connect.isPending} onClick={() => connect.mutate(undefined, { onError: (err) => toast.error(errorMessage(err)) })}>
      {google.connected ? 'Reconnect Google account' : 'Connect Google account'}
    </Button>
  );

  return (
    <Panel>
      <PanelHeader
        title="Google Search Console"
        description="Read-only access (webmasters.readonly) to the properties of one Google account."
        actions={
          <span className="flex items-center gap-2 text-ui font-medium">
            <StatusDot tone={tone} />
            {!google.configured ? 'Not configured' : google.connected ? (google.status === 'CONNECTED' ? 'Connected' : google.status.toLowerCase().replace(/^./, (c) => c.toUpperCase())) : 'Not connected'}
          </span>
        }
      />
      <div className="grid gap-5 px-5 py-5">
        {!google.configured ? (
          <>
            <InlineNotice tone="warning" icon={CircleAlert}>
              Google OAuth credentials are missing on the server: {google.missingConfig.join(', ') || 'unknown variables'}.
            </InlineNotice>
            <ol className="grid max-w-[72ch] list-decimal gap-1.5 pl-5 text-sm text-ink-2">
              <li>In Google Cloud Console, create a project and enable the Google Search Console API.</li>
              <li>Configure the OAuth consent screen (internal or external with your account as test user).</li>
              <li>Create an OAuth client ID of type "Web application".</li>
              <li>Add the redirect URI below as an authorized redirect URI.</li>
              <li>Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI in .env and restart the backend.</li>
            </ol>
            {google.redirectUri ? <DefinitionList items={[{ label: 'Redirect URI', value: <CopyValue value={google.redirectUri} /> }]} /> : null}
          </>
        ) : !google.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-[60ch] text-sm text-ink-2">
              Connect the Google account that has access to your Search Console properties. All markets share this connection.
            </p>
            {connectButton}
          </div>
        ) : (
          <>
            {google.status !== 'CONNECTED' || google.lastError ? (
              <InlineNotice tone="danger" icon={CircleAlert}>
                {google.lastError ?? 'The connection needs to be renewed.'} Reconnect the account to restore access.
              </InlineNotice>
            ) : null}
            <DefinitionList
              items={[
                { label: 'Account', value: google.email ?? '—' },
                { label: 'Permissions', value: google.scopes.length ? google.scopes.map((s) => s.replace('https://www.googleapis.com/auth/', '')).join(', ') : '—' },
                { label: 'Connected', value: displayDateTime(google.connectedAt) },
                { label: 'Token refreshed', value: google.lastRefreshedAt ? displayRelative(google.lastRefreshedAt) : 'Not yet' },
                ...(google.redirectUri ? [{ label: 'Redirect URI', value: <CopyValue value={google.redirectUri} /> }] : []),
              ]}
            />
            <div className="flex flex-wrap gap-2">
              {google.status !== 'CONNECTED' ? connectButton : null}
              <Button variant="destructive-ghost" onClick={() => setConfirm(true)}>
                <Unplug />
                Disconnect
              </Button>
            </div>
          </>
        )}
      </div>
      {google.connected ? <PropertiesTable /> : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Disconnect Google account?"
        description="The access token is revoked and deleted. Markets keep their property settings and will work again after reconnecting."
        confirmLabel="Disconnect"
        pending={disconnect.isPending}
        onConfirm={() =>
          disconnect.mutate(undefined, {
            onSuccess: () => {
              toast.success('Google account disconnected');
              setConfirm(false);
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      />
    </Panel>
  );
}

function PropertiesTable() {
  const properties = useGoogleProperties(true);
  const sync = useSyncProperties();
  const verify = useVerifyProperty();
  const [results, setResults] = useState<Record<string, PropertyVerificationDTO>>({});

  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="grid gap-0.5">
          <h3 className="text-sm font-semibold">Properties</h3>
          <p className="text-ui text-muted">Domain and URL-prefix properties available to the connected account.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={sync.isPending}
          onClick={() =>
            sync.mutate(undefined, {
              onSuccess: (items) => toast.success(`Properties refreshed (${items.length})`),
              onError: (err) => toast.error(errorMessage(err)),
            })
          }
        >
          {sync.isPending ? null : <RefreshCw />}
          Refresh properties
        </Button>
      </div>
      {properties.isPending ? (
        <TableSkeleton rows={3} columns={4} />
      ) : properties.isError ? (
        <ErrorState compact error={properties.error} onRetry={() => void properties.refetch()} />
      ) : properties.data.length === 0 ? (
        <EmptyState compact title="No properties found" description="Add your site in Search Console with this Google account, then refresh." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Property</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Permission</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Markets</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties.data.map((property) => {
              const result = results[property.siteUrl];
              const accessible = result ? result.accessible : property.isAccessible;
              return (
                <TableRow key={property.id}>
                  <TableCell>
                    <span className="grid min-w-0">
                      <span className="truncate font-medium">{property.displayName}</span>
                      <span className="truncate text-xs text-muted">{property.siteUrl}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <PropertyTypeBadge siteUrl={property.siteUrl} />
                  </TableCell>
                  <TableCell className="text-ink-2">{property.permissionLevel}</TableCell>
                  <TableCell>
                    {accessible ? (
                      <Badge variant="success">
                        <CircleCheck />
                        Accessible
                      </Badge>
                    ) : (
                      <Badge variant="danger" title={result?.message}>
                        <CircleAlert />
                        No access
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-2">{property.marketsCount}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={verify.isPending && verify.variables === property.siteUrl}
                      onClick={() =>
                        verify.mutate(property.siteUrl, {
                          onSuccess: (res) => {
                            setResults((r) => ({ ...r, [property.siteUrl]: res }));
                            if (res.accessible) toast.success(res.message);
                            else toast.error(res.message);
                          },
                          onError: (err) => toast.error(errorMessage(err)),
                        })
                      }
                    >
                      <ShieldCheck />
                      Verify
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function AnthropicPanel({ data }: { data: IntegrationsStatusDTO }) {
  const { anthropic } = data;
  return (
    <Panel>
      <PanelHeader
        title="Anthropic"
        description="Writes the SEO analysis from the Search Console data. Calls run on the server only."
        actions={
          <span className="flex items-center gap-2 text-ui font-medium">
            <StatusDot tone={anthropic.configured ? 'success' : 'neutral'} />
            {anthropic.configured ? 'Configured' : 'Not configured'}
          </span>
        }
      />
      <div className="grid gap-4 px-5 py-5">
        {!anthropic.configured ? (
          <InlineNotice tone="neutral">
            Set ANTHROPIC_API_KEY in the server's .env file and restart the backend. The key is never sent to the browser. Until then,
            reports can be generated without AI analysis.{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-medium text-ink underline underline-offset-2"
            >
              Get an API key
              <ExternalLink className="size-3" />
            </a>
          </InlineNotice>
        ) : null}
        <DefinitionList
          items={[
            { label: 'Model', value: anthropic.model },
            { label: 'Effort', value: anthropic.effort },
            { label: 'Refusal fallback', value: anthropic.fallbackEnabled ? 'Enabled (server-side default fallback)' : 'Disabled' },
          ]}
        />
      </div>
    </Panel>
  );
}

function SystemPanel({ data }: { data: IntegrationsStatusDTO }) {
  return (
    <Panel>
      <PanelHeader title="System" />
      <div className="px-5 py-5">
        <DefinitionList
          items={[
            {
              label: 'PDF engine',
              value: (
                <span className="flex items-center gap-2">
                  <StatusDot tone={data.pdf.available === false ? 'danger' : data.pdf.available ? 'success' : 'neutral'} />
                  Chromium via Playwright
                  {data.pdf.available === null ? <span className="text-muted">(checked on first render)</span> : null}
                  {data.pdf.available === false ? <span className="text-danger">(unavailable)</span> : null}
                </span>
              ),
            },
            {
              label: 'Database',
              value: (
                <span className="flex items-center gap-2">
                  <StatusDot tone={data.database.ok ? 'success' : 'danger'} />
                  PostgreSQL {data.database.ok ? 'reachable' : 'unreachable'}
                </span>
              ),
            },
          ]}
        />
      </div>
    </Panel>
  );
}
