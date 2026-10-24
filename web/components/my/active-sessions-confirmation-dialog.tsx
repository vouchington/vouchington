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
import type { AuthSession } from '@/types/my'

export type SessionConfirmation =
  | { type: 'session'; session: AuthSession }
  | { type: 'all' }
  | { type: 'mcp'; grantId: string }
  | null

export function ActiveSessionsConfirmationDialog({
  confirmation,
  disabled,
  onClose,
  onConfirm,
}: {
  confirmation: SessionConfirmation
  disabled: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const t = useTranslations()
  const current = confirmation?.type === 'session' && confirmation.session.is_current

  return (
    <AlertDialog
      open={confirmation !== null}
      onOpenChange={open => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmation?.type === 'all'
              ? t('settings.activeSessions.confirmAllTitle')
              : confirmation?.type === 'mcp'
                ? t('settings.activeSessions.confirmMcpTitle')
                : current
                  ? t('settings.activeSessions.confirmCurrentTitle')
                  : t('settings.activeSessions.confirmSessionTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmation?.type === 'all'
              ? t('settings.activeSessions.confirmAllDescription')
              : confirmation?.type === 'mcp'
                ? t('settings.activeSessions.confirmMcpDescription')
                : current
                  ? t('settings.activeSessions.confirmCurrentDescription')
                  : t('settings.activeSessions.confirmSessionDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={disabled}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            data-pw='active-sessions-confirmation-dialog-sign-out-all-devices'
            disabled={disabled}
            onClick={onConfirm}
          >
            {confirmation?.type === 'all'
              ? t('settings.activeSessions.signOutAllDevices')
              : confirmation?.type === 'mcp'
                ? t('settings.activeSessions.revokeMcpAccess')
                : t('settings.activeSessions.signOutSession')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
