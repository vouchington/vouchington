'use client'

import { useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
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
import { Button } from '@/components/ui/button'
import { deleteAuthSession, revokeAuthSessions } from '@/lib/api/client'
import { useRouter } from 'next/navigation'
import { ActiveSessionRow } from './active-session-row'
import type { AuthSession } from '@/types/my'
import type { ListResponse } from '@/types/api-responses'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { useActiveSessionPagination } from './use-active-session-pagination'

interface Props {
  initialData?: ListResponse<AuthSession>
  initialSessions?: AuthSession[]
}

type Confirmation =
  | {
      type: 'session'
      session: AuthSession
    }
  | {
      type: 'all'
    }
  | null

export function ActiveSessionsManager({ initialData, initialSessions }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const { pagination, sessions, removeSession } = useActiveSessionPagination(
    initialData,
    initialSessions,
  )
  const handleLoadMore = pagination.loadMore
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)
  const [signingOutAll, setSigningOutAll] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const { replace } = useRouter()
  const pendingSession = confirmation?.type === 'session' ? confirmation.session : null

  async function handleSignOut(session: AuthSession) {
    setLoadingSessionId(session.id)
    try {
      await deleteAuthSession(session.id)
      removeSession(session.id)
      onSuccess(t('settings.activeSessions.toastSessionSignedOut'))
      if (session.is_current) {
        replace('/login')
      }
    } catch (error) {
      onError(error, {
        fallback: t('settings.activeSessions.toastFailedSignOutSession'),
        tags: { form: 'active-sessions' },
      })
    } finally {
      setLoadingSessionId(null)
    }
  }

  async function handleSignOutAll() {
    setSigningOutAll(true)
    try {
      await revokeAuthSessions()
      onSuccess(t('settings.activeSessions.toastAllSessionsSignedOut'))
      replace('/login')
    } catch (error) {
      onError(error, {
        fallback: t('settings.activeSessions.toastFailedSignOutAllDevices'),
        tags: { form: 'active-sessions' },
      })
    } finally {
      setSigningOutAll(false)
    }
  }

  function confirmPendingAction() {
    const pending = confirmation
    setConfirmation(null)
    if (pending?.type === 'session') {
      void handleSignOut(pending.session)
    } else if (pending?.type === 'all') {
      void handleSignOutAll()
    }
  }

  return (
    <section
      className='space-y-4'
      data-pw='active-sessions-manager'
    >
      <div className='space-y-1'>
        <h2 className='text-lg font-semibold'>{t('settings.activeSessions.title')}</h2>
        <p className='text-sm text-muted-foreground'>{t('settings.activeSessions.description')}</p>
      </div>

      <div className='flex justify-end'>
        <Button
          variant='destructive'
          onClick={() => setConfirmation({ type: 'all' })}
          loading={signingOutAll}
          disabled={signingOutAll || loadingSessionId !== null}
          data-pw='active-sessions-sign-out-all-button'
        >
          {t('settings.activeSessions.signOutAllDevices')}
        </Button>
      </div>

      <InfiniteScroll
        hasNextPage={pagination.hasNextPage}
        endCursor={pagination.endCursor}
        onLoadMore={handleLoadMore}
        loadingMore={pagination.loadingMore}
        fetchError={pagination.fetchError}
        clearError={pagination.clearError}
        resetKey={pagination.resetKey}
      >
        <ul className='space-y-2'>
          {sessions.map(session => (
            <ActiveSessionRow
              key={session.id}
              loading={signingOutAll || loadingSessionId === session.id}
              session={session}
              t={t}
              uiLocale={uiLocale}
              onSignOut={session => setConfirmation({ type: 'session', session })}
            />
          ))}
        </ul>
      </InfiniteScroll>

      {sessions.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('settings.activeSessions.empty')}</p>
      ) : null}

      <AlertDialog
        open={confirmation !== null}
        onOpenChange={open => {
          if (!open) setConfirmation(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation?.type === 'all'
                ? t('settings.activeSessions.confirmAllTitle')
                : pendingSession?.is_current
                  ? t('settings.activeSessions.confirmCurrentTitle')
                  : t('settings.activeSessions.confirmSessionTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.type === 'all'
                ? t('settings.activeSessions.confirmAllDescription')
                : pendingSession?.is_current
                  ? t('settings.activeSessions.confirmCurrentDescription')
                  : t('settings.activeSessions.confirmSessionDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loadingSessionId !== null || signingOutAll}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={loadingSessionId !== null || signingOutAll}
              onClick={confirmPendingAction}
            >
              {confirmation?.type === 'all'
                ? t('settings.activeSessions.signOutAllDevices')
                : t('settings.activeSessions.signOutSession')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
