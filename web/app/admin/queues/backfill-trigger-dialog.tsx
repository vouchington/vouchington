'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Backfill } from '@/lib/api/client/mq'
import { useTranslations } from '@/lib/i18n/use-translations'

export function BackfillTriggerDialog({
  onConfirm,
  onPendingBackfillChange,
  pendingBackfill,
}: {
  onConfirm: () => void
  onPendingBackfillChange: (backfill: Backfill | null) => void
  pendingBackfill: Backfill | null
}) {
  const t = useTranslations()
  return (
    <AlertDialog
      open={pendingBackfill !== null}
      onOpenChange={(open: boolean) => {
        if (!open) onPendingBackfillChange(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('extracted.queues.backfillTriggerDialog.runBackfillDescription_502faa6e', {
              description: pendingBackfill?.description ?? '',
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'extracted.queues.backfillTriggerDialog.thisWillEnqueueAJobnameDispatcher_70b49fc7',
              {
                jobName: pendingBackfill?.job_name ?? '',
                sourceTable: pendingBackfill?.source_table ?? '',
              },
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t('extracted.queues.backfillTriggerDialog.cancel_19766ed6')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t('extracted.queues.backfillTriggerDialog.runBackfill_625fd5e1')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
