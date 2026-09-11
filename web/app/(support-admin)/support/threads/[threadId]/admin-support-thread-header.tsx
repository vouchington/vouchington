'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { SupportThread } from '@/types/support'
import { SupportThreadStatusBadge } from '../../support-thread-status-badge'
import { useTranslations } from '@/lib/i18n/use-translations'
import { SupportActionConfirmationDialog } from './support-action-confirmation-dialog'

interface AdminSupportThreadHeaderProps {
  actionError: string | null
  actionLoading: string | null
  handleAssignToMe: () => void
  handleReopen: () => void
  handleResolve: () => void
  thread: SupportThread
}

export function AdminSupportThreadHeader({
  actionError,
  actionLoading,
  handleAssignToMe,
  handleReopen,
  handleResolve,
  thread,
}: AdminSupportThreadHeaderProps) {
  const t = useTranslations()
  const [pendingAction, setPendingAction] = useState<'reopen' | 'resolve' | null>(null)
  const isResolve = pendingAction === 'resolve'
  return (
    <div className='rounded-lg border bg-card p-4'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1
            data-pw='support-thread-page-heading'
            className='text-xl font-bold text-foreground'
          >
            {thread.subject}
          </h1>
          <div className='mt-1 flex items-center gap-2'>
            <SupportThreadStatusBadge status={thread.status} />
            <span
              className='text-sm text-muted-foreground'
              suppressHydrationWarning
            >
              {t('extracted.threadid.adminSupportThreadHeader.createdDate_e0c0a13e', {
                date: new Date(thread.created_at).toLocaleString(),
              })}
            </span>
            {thread.conversation_id && (
              <span className='text-sm text-muted-foreground'>
                {t(
                  'extracted.threadid.adminSupportThreadHeader.conversationConversationid_5459c703',
                  {
                    conversationId: thread.conversation_id.slice(0, 8),
                  },
                )}
              </span>
            )}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {thread.status === 'open' && (
            <Button
              data-pw='support-thread-assign-to-me'
              size='sm'
              variant='outline'
              onClick={handleAssignToMe}
              loading={actionLoading === 'assign'}
              disabled={actionLoading !== null}
            >
              {t('extracted.threadid.adminSupportThreadHeader.assignToMe_d124d50d')}
            </Button>
          )}
          {thread.status !== 'resolved' ? (
            <Button
              data-pw='support-thread-resolve'
              size='sm'
              variant='outline'
              onClick={() => setPendingAction('resolve')}
              loading={actionLoading === 'resolve'}
              disabled={actionLoading !== null}
            >
              {t('extracted.threadid.adminSupportThreadHeader.resolve_c8f193b3')}
            </Button>
          ) : (
            <Button
              data-pw='support-thread-reopen'
              size='sm'
              variant='outline'
              onClick={() => setPendingAction('reopen')}
              loading={actionLoading === 'reopen'}
              disabled={actionLoading !== null}
            >
              {t('extracted.threadid.adminSupportThreadHeader.reopen_a886d1dc')}
            </Button>
          )}
        </div>
      </div>
      {actionError && <p className='mt-2 text-sm text-destructive'>{actionError}</p>}
      <SupportActionConfirmationDialog
        actionLabel={
          isResolve
            ? t('extracted.threadid.adminSupportThreadHeader.resolve_c8f193b3')
            : t('extracted.threadid.adminSupportThreadHeader.reopen_a886d1dc')
        }
        description={
          isResolve
            ? t('extracted.threadid.adminSupportThreadHeader.resolveThisSupportThread_e9e6cb0b')
            : t('extracted.threadid.adminSupportThreadHeader.reopenThisSupportThread_f3c9e6fa')
        }
        onConfirm={isResolve ? handleResolve : handleReopen}
        onOpenChange={open => {
          if (!open) setPendingAction(null)
        }}
        open={pendingAction !== null}
      />
    </div>
  )
}
