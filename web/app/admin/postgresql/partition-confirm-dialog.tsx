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
import {
  PARTITION_ACTION_DESCRIPTIONS,
  PARTITION_ACTION_LABELS,
  type PartitionAction,
} from './postgresql-state'
import { useTranslations } from '@/lib/i18n/use-translations'

export function PartitionConfirmDialog({
  confirmPartitionAction,
  pendingAction,
  setPendingAction,
}: {
  confirmPartitionAction: () => void
  pendingAction: PartitionAction | null
  setPendingAction: (action: PartitionAction | null) => void
}) {
  const t = useTranslations()
  return (
    <AlertDialog
      open={pendingAction !== null}
      onOpenChange={(open: boolean) => {
        if (!open) setPendingAction(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingAction ? PARTITION_ACTION_LABELS[pendingAction] : ''}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingAction ? PARTITION_ACTION_DESCRIPTIONS[pendingAction] : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t('extracted.postgresql.partitionConfirmDialog.cancel_19766ed6')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmPartitionAction}>
            {t('extracted.postgresql.partitionConfirmDialog.confirm_eebdd24a')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
