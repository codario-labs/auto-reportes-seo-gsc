import { KeyRound } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { accessUnlockSchema, type AccessStatusDTO } from '@codario/shared';
import { ErrorState } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { queryKeys, useAccessStatus, useUnlock } from '@/features/api-hooks';
import { ApiError, onAccessRequired } from '@/lib/api';

/**
 * Restricción de acceso al panel (app single-user, sin cuentas):
 * se desbloquea con la clave APP_ACCESS_KEY configurada en el servidor.
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const status = useAccessStatus();

  useEffect(
    () =>
      onAccessRequired(() => {
        queryClient.setQueryData<AccessStatusDTO>(queryKeys.access, { unlocked: false, expiresAt: null });
      }),
    [queryClient],
  );

  if (status.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading workspace">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (status.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <ErrorState error={status.error} title="The workspace is unreachable" onRetry={() => void status.refetch()} />
      </div>
    );
  }

  if (!status.data.unlocked) return <UnlockScreen />;
  return <>{children}</>;
}

function UnlockScreen() {
  const unlock = useUnlock();
  const [accessKey, setAccessKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = accessUnlockSchema.safeParse({ accessKey });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter the access key');
      return;
    }
    setError(null);
    unlock.mutate(parsed.data.accessKey, {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 429) setError('Too many attempts. Wait a few minutes and try again.');
        else if (err instanceof ApiError && err.status === 401) setError('That access key is not valid.');
        else setError(err instanceof Error ? err.message : 'The workspace could not be unlocked.');
      },
    });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 grid gap-1">
          <p className="text-sm font-semibold tracking-[-0.01em] text-ink">Codario Labs</p>
          <p className="text-ui text-muted">SEO Reports</p>
        </div>
        <form onSubmit={onSubmit} className="grid gap-5 rounded-dialog border border-line bg-surface p-6" noValidate>
          <div className="grid gap-1">
            <h1 className="text-lg font-semibold tracking-[-0.015em]">Unlock workspace</h1>
            <p className="text-sm text-ink-2">
              This workspace is private. Enter the access key configured on the server.
            </p>
          </div>
          <Field label="Access key" htmlFor="access-key" error={error}>
            <Input
              id="access-key"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={accessKey}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? 'access-key-message' : undefined}
              onChange={(event) => setAccessKey(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={unlock.isPending} className="w-full">
            <KeyRound />
            Unlock
          </Button>
        </form>
        <p className="mt-4 text-ui text-muted">The key is set with APP_ACCESS_KEY in the server environment.</p>
      </div>
    </main>
  );
}
