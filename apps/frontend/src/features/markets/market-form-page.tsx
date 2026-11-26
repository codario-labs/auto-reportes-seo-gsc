import { ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader, Panel, PanelHeader } from '@/components/app/panel';
import { ErrorState } from '@/components/app/states';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import {
  useCreateMarket,
  useDeleteMarket,
  useDeleteMarketLogo,
  useMarket,
  useUpdateMarket,
  useUploadMarketLogo,
} from '@/features/api-hooks';
import { errorMessage } from '@/lib/api';
import { MarketForm, type MarketFormSubmit } from './market-form';
import { marketToFormValues } from './market-form-values';

export function MarketFormPage() {
  const { id } = useParams();
  return id ? <EditMarket id={id} /> : <CreateMarket />;
}

function CreateMarket() {
  const navigate = useNavigate();
  const create = useCreateMarket();
  const uploadLogo = useUploadMarketLogo();
  const [pending, setPending] = useState(false);

  const onSubmit = async ({ input, logoFile }: MarketFormSubmit) => {
    setPending(true);
    try {
      const market = await create.mutateAsync(input);
      if (logoFile) {
        try {
          await uploadLogo.mutateAsync({ id: market.id, file: logoFile });
        } catch (err) {
          toast.error(`Market created, but the logo was not uploaded: ${errorMessage(err)}`);
        }
      }
      toast.success('Market created');
      navigate(`/markets/${market.id}`);
    } catch {
      // El error se muestra en el formulario mediante create.error.
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <BackLink to="/markets" label="Markets" />
      <PageHeader title="New market" description="Connect a website to its Search Console property and brand." />
      <MarketForm
        initial={marketToFormValues()}
        submitLabel="Create market"
        cancelTo="/markets"
        pending={pending}
        serverError={create.error}
        onSubmit={(data) => void onSubmit(data)}
      />
    </>
  );
}

function EditMarket({ id }: { id: string }) {
  const navigate = useNavigate();
  const market = useMarket(id);
  const update = useUpdateMarket();
  const uploadLogo = useUploadMarketLogo();
  const deleteLogo = useDeleteMarketLogo();
  const remove = useDeleteMarket();
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (market.isPending) {
    return (
      <div className="grid gap-6" role="status" aria-label="Loading market">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 w-full rounded-panel" />
      </div>
    );
  }
  if (market.isError) return <ErrorState error={market.error} onRetry={() => void market.refetch()} />;

  const onSubmit = async ({ input, logoFile, removeLogo }: MarketFormSubmit) => {
    setPending(true);
    try {
      await update.mutateAsync({ id, input });
    } catch {
      // El formulario muestra update.error (incluidos los errores por campo).
      setPending(false);
      return;
    }
    try {
      if (logoFile) await uploadLogo.mutateAsync({ id, file: logoFile });
      else if (removeLogo && market.data.logoUrl) await deleteLogo.mutateAsync(id);
      toast.success('Market saved');
    } catch (err) {
      toast.error(`Market saved, but the logo could not be updated: ${errorMessage(err)}`);
    } finally {
      setPending(false);
    }
    navigate(`/markets/${id}`);
  };

  return (
    <>
      <BackLink to={`/markets/${id}`} label={market.data.name} />
      <PageHeader title={`Edit ${market.data.name}`} description={market.data.domain} />
      <MarketForm
        key={market.data.id}
        initial={marketToFormValues(market.data)}
        currentLogoUrl={market.data.logoUrl}
        submitLabel="Save market"
        cancelTo={`/markets/${id}`}
        pending={pending}
        serverError={update.error}
        onSubmit={(data) => void onSubmit(data)}
      />

      <Panel className="mt-10 border-danger/25">
        <PanelHeader
          title="Delete market"
          description={`Removes the market and its ${market.data.reportsCount} report(s), including the PDFs. This can't be undone.`}
          actions={
            <Button variant="destructive-ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete market
            </Button>
          }
          className="border-b-0"
        />
      </Panel>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${market.data.name}?`}
        description={`The market and its ${market.data.reportsCount} report(s), including their PDFs, will be permanently deleted.`}
        confirmLabel="Delete market"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              toast.success('Market deleted');
              navigate('/markets');
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      />
    </>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1.5 text-ui text-muted hover:text-ink">
      <ArrowLeft className="size-3.5" />
      {label}
    </Link>
  );
}
