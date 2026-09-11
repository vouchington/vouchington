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
import { FLUSH_CONCERN_METADATA, type PendingValkeyAction } from './valkey-state'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ValkeyConfirmDialogProps {
  confirmAction: () => void
  pendingAction: PendingValkeyAction | null
  setPendingAction: (action: PendingValkeyAction | null) => void
}

export function ValkeyConfirmDialog({
  confirmAction,
  pendingAction,
  setPendingAction,
}: ValkeyConfirmDialogProps) {
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
          <AlertDialogTitle>{pendingAction ? getDialogTitle(pendingAction) : ''}</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingAction ? getDialogDescription(pendingAction) : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t('extracted.valkey.valkeyConfirmDialog.cancel_19766ed6')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmAction}>
            {t('extracted.valkey.valkeyConfirmDialog.confirm_eebdd24a')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function getDialogTitle(action: PendingValkeyAction): string {
  if (action.type === 'rebuild') return `Rebuild ${action.target}?`
  if (action.type === 'clear') return `Clear ${action.target} cache?`
  if (action.type === 'flush') return `Flush ${action.concern}?`
  return 'Clear all caches?'
}

function getDialogDescription(action: PendingValkeyAction): string {
  if (action.type === 'rebuild') {
    return `This will enqueue a job to rebuild the ${action.target} bloom filter. Existing filter data will be replaced.`
  }
  if (action.type === 'clear') {
    return `This will delete all cached entries for the ${action.target} group. They will be repopulated on next access.`
  }
  if (action.type === 'flush') return FLUSH_CONCERN_METADATA[action.concern].description
  return 'This will delete all cached entities across all cache groups. They will be repopulated on next access.'
}
