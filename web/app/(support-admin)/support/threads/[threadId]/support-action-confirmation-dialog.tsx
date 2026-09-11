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
import { useTranslations } from '@/lib/i18n/use-translations'

interface SupportActionConfirmationDialogProps {
  actionLabel: string
  description: string
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function SupportActionConfirmationDialog({
  actionLabel,
  description,
  onConfirm,
  onOpenChange,
  open,
}: SupportActionConfirmationDialogProps) {
  const t = useTranslations()
  return (
    <AlertDialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <AlertDialogContent data-pw='support-action-confirmation-dialog'>
        <AlertDialogHeader>
          <AlertDialogTitle>{actionLabel}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t('extracted.threadid.adminSupportMessageCard.cancel_19766ed6')}
          </AlertDialogCancel>
          <AlertDialogAction
            data-pw='support-action-confirmation-confirm'
            onClick={onConfirm}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
