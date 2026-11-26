import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/misc';
import { useCancelReport, useReportStatus, useRetryReport } from '@/features/api-hooks';
import { errorMessage } from '@/lib/api';
import { GenerateReportForm } from './generate-report-form';
import { ReportProgress } from './report-progress';

/** Sigue un reporte en curso (polling cada 1,5 s) con cancelación y reintento. */
export function TrackedReportProgress({
  reportId,
  onReportChange,
  showViewLink,
}: {
  reportId: string;
  onReportChange?: (id: string) => void;
  showViewLink?: boolean;
}) {
  const status = useReportStatus(reportId);
  const cancel = useCancelReport();
  const retry = useRetryReport();

  if (!status.data) {
    return (
      <div className="grid gap-3" role="status" aria-label="Loading report status">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <ReportProgress
      report={status.data}
      showViewLink={showViewLink}
      cancelling={cancel.isPending}
      retrying={retry.isPending}
      onCancel={() =>
        cancel.mutate(reportId, {
          onSuccess: () => toast('Generation cancelled'),
          onError: (err) => toast.error(errorMessage(err)),
        })
      }
      onRetry={() =>
        retry.mutate(reportId, {
          onSuccess: ({ report }) => {
            toast.success('Report generation restarted');
            onReportChange?.(report.id);
          },
          onError: (err) => toast.error(errorMessage(err)),
        })
      }
    />
  );
}

interface GenerateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMarketId?: string | null;
  lockMarket?: boolean;
  /** Abre el diálogo directamente en la vista de progreso de un reporte existente. */
  reportId?: string | null;
}

export function GenerateReportDialog({ open, onOpenChange, defaultMarketId, lockMarket, reportId: initialReportId }: GenerateReportDialogProps) {
  const [createdId, setCreatedId] = useState<string | null>(null);
  const reportId = createdId ?? initialReportId ?? null;

  const handleOpenChange = (next: boolean) => {
    if (!next) setCreatedId(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{reportId ? 'Generating report' : 'Generate report'}</DialogTitle>
          <DialogDescription>
            {reportId
              ? 'Each step reflects the real progress on the server. You can close this window; the report keeps generating.'
              : 'Search Console data for the period is fetched, compared and turned into a branded PDF.'}
          </DialogDescription>
        </DialogHeader>
        {reportId ? (
          <TrackedReportProgress reportId={reportId} onReportChange={setCreatedId} />
        ) : (
          <GenerateReportForm
            defaultMarketId={defaultMarketId}
            lockMarket={lockMarket}
            onCreated={({ report }) => setCreatedId(report.id)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
