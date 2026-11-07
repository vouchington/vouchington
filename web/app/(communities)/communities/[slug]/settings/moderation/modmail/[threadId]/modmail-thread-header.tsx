'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TimeAgo } from '@/components/shared/time-ago'
import { resolveModmailThread, type ModmailThread } from '@/lib/api/client/modmail'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ModmailThreadHeader({
  communitySlug,
  thread,
  isMod,
  onResolved,
}: {
  communitySlug: string
  thread: ModmailThread
  isMod: boolean
  onResolved: (thread: ModmailThread) => void
}) {
  const t = useTranslations()

  async function handleResolve() {
    try {
      const result = await resolveModmailThread(communitySlug, thread.id)
      onResolved(result.thread)
    } catch (err) {
      onError(err, {
        fallback: t('extracted.threadid.modmailThreadClient.failedToResolveThread_55590a32'),
      })
    }
  }

  return (
    <div className='flex items-center justify-between gap-4 rounded-lg border bg-card p-4'>
      <div className='space-y-1 text-sm text-muted-foreground'>
        {thread.subject_user_id && (
          <p>
            {t('extracted.threadid.modmailThreadClient.memberSubjectuserid_d67b2b8c', {
              subjectUserId: thread.subject_user_id,
            })}
          </p>
        )}
        {thread.assigned_moderator_user_id && (
          <p>
            {t('extracted.threadid.modmailThreadClient.assignedToAssignedmodid_3baaa2ab', {
              assignedModId: thread.assigned_moderator_user_id,
            })}
          </p>
        )}
        <p>
          {t('extracted.threadid.modmailThreadClient.opened_b19fb8d1')}{' '}
          <TimeAgo date={thread.created_at} />
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Badge variant={thread.resolved_at ? 'secondary' : 'default'}>
          {thread.resolved_at
            ? t('extracted.threadid.modmailThreadClient.resolved_dc676b42')
            : t('extracted.threadid.modmailThreadClient.open_2348f998')}
        </Badge>
        {!thread.resolved_at && isMod && (
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              void handleResolve()
            }}
            data-pw='modmail-resolve-button'
          >
            {t('extracted.threadid.modmailThreadClient.resolve_c8f193b3')}
          </Button>
        )}
      </div>
    </div>
  )
}
