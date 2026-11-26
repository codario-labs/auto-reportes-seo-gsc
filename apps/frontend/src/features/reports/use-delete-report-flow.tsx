import type { ReportDTO } from '@codario/shared';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { useDeleteReport } from '@/features/api-hooks';
import { errorMessage } from '@/lib/api';
import { displayRange } from '@/lib/format';

/** Estado + diálogo de confirmación para eliminar un reporte. */
export function useDeleteReportFlow(onDeleted?: () => void) {
  const [target, setTarget] = useState<ReportDTO | null>(null);
  const remove = useDeleteReport();

  const dialog = (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => (!open ? setTarget(null) : undefined)}
      title="Delete report?"
      description={
        target
          ? `The ${target.market.name} report for ${displayRange(target.startDate, target.endDate)} and its PDF will be permanently deleted.`
          : ''
      }
      confirmLabel="Delete report"
      pending={remove.isPending}
      onConfirm={() => {
        if (!target) return;
        remove.mutate(target.id, {
          onSuccess: () => {
            toast.success('Report deleted');
            setTarget(null);
            onDeleted?.();
          },
          onError: (err) => toast.error(errorMessage(err)),
        });
      }}
    />
  );

  return { requestDelete: setTarget, dialog };
}
