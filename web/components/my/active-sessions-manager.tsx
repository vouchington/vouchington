'use client'

import { useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { Button } from '@/components/ui/button'
import { deleteAuthSession, revokeAuthSessions } from '@/lib/api/client'
import { revokeOAuthGrant } from '@/lib/api/client/oauth-grants'
import { useRouter } from 'next/navigation'
import { ActiveSessionRow } from './active-session-row'
import type { AuthSession } from '@/types/my'
import type { ListResponse } from '@/types/api-responses'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { useActiveSessionPagination } from './use-active-session-pagination'
import {
  ActiveSessionsConfirmationDialog,
  type SessionConfirmation,
} from './active-sessions-confirmation-dialog'

interface Props {
  initialData?: ListResponse<AuthSession>
  initialSessions?: AuthSession[]
}

export function ActiveSessionsManager({ initialData, initialSessions }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const { pagination, sessions, removeSession } = useActiveSessionPagination(
    initialData,
    initialSessions,
  )
  const handleLoadMore = pagination.loadMore
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null)
  const [revokedGrantIds, setRevokedGrantIds] = useState<ReadonlySet<string>>(() => new Set())
  const [signingOutAll, setSigningOutAll] = useState(false)
  const [confirmation, setConfirmation] = useState<SessionConfirmation>(null)
  const { replace } = useRouter()

  async function handleSignOut(session: AuthSession) {
    setLoadingSessionId(session.id)
    try {
      await deleteAuthSession(session.id)
      removeSession(session.id)
      onSuccess(t('settings.activeSessions.toastSessionSignedOut'))
      if (session.is_current) {
        replace('/login')
      }
    } catch (err) {
      onError(err, {
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
    } catch (err) {
      onError(err, {
        fallback: t('settings.activeSessions.toastFailedSignOutAllDevices'),
        tags: { form: 'active-sessions' },
      })
    } finally {
      setSigningOutAll(false)
    }
  }

  async function handleRevokeMcp(grantId: string) {
    setRevokingGrantId(grantId)
    try {
      await revokeOAuthGrant(grantId)
      setRevokedGrantIds(previous => new Set(previous).add(grantId))
      onSuccess(t('settings.activeSessions.mcpAccessRevoked'))
    } catch (err) {
      onError(err, {
        fallback: t('settings.activeSessions.mcpRevokeFailed'),
        tags: { form: 'active-sessions' },
      })
    } finally {
      setRevokingGrantId(null)
    }
  }

  function confirmPendingAction() {
    const pending = confirmation
    setConfirmation(null)
    if (pending?.type === 'session') {
      void handleSignOut(pending.session)
    } else if (pending?.type === 'all') {
      void handleSignOutAll()
    } else if (pending?.type === 'mcp') {
      void handleRevokeMcp(pending.grantId)
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
              loading={signingOutAll || loadingSessionId === session.id || revokingGrantId !== null}
              session={{
                ...session,
                mcp_connections: session.mcp_connections.filter(
                  connection => !revokedGrantIds.has(connection.grant_id),
                ),
              }}
              t={t}
              uiLocale={uiLocale}
              onSignOut={session => setConfirmation({ type: 'session', session })}
              onRevokeMcp={grantId => setConfirmation({ type: 'mcp', grantId })}
              revokingGrantId={revokingGrantId}
            />
          ))}
        </ul>
      </InfiniteScroll>

      {sessions.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('settings.activeSessions.empty')}</p>
      ) : null}

      <ActiveSessionsConfirmationDialog
        confirmation={confirmation}
        disabled={loadingSessionId !== null || signingOutAll || revokingGrantId !== null}
        onClose={() => setConfirmation(null)}
        onConfirm={confirmPendingAction}
      />
    </section>
  )
}
