'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { PostContentText } from '@/components/posts/post-content-text'
import { Button } from '@/components/ui/button'
import { dismissCommunityAutomodFlag } from '@/lib/api/client/community-automod'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError, { onSuccess } from '@/lib/on-error'
import type { CommunityModerationQueueEntry } from '@/types/api-responses'

interface CommunityAutomodFlagsPanelProps {
  entries: CommunityModerationQueueEntry[]
  communitySlug: string
}

/**
 * Posts the community's automod flagged for review (the community's `review_queue` setting).
 * A flag stays open until a moderator dismisses it or the post's content changes.
 */
export function CommunityAutomodFlagsPanel({
  entries,
  communitySlug,
}: CommunityAutomodFlagsPanelProps) {
  const t = useTranslations()
  const router = useRouter()
  const [pendingPostId, setPendingPostId] = useState<string | null>(null)
  const [dismissedPostIds, setDismissedPostIds] = useState<Record<string, true>>({})
  const [isRefreshing, startRefreshing] = useTransition()
  const visibleEntries = entries.filter(entry => !dismissedPostIds[entry.entity_id])

  if (visibleEntries.length === 0) {
    return null
  }

  async function dismiss(postId: string) {
    setPendingPostId(postId)
    try {
      await dismissCommunityAutomodFlag(communitySlug, postId)
      setDismissedPostIds(current => ({ ...current, [postId]: true }))
      onSuccess(t('extracted.communities.communityAutomodFlagsPanel.automodFlagDismissed_66ee7e46'))
      startRefreshing(() => router.refresh())
    } catch (err) {
      onError(err, {
        fallback: t(
          'extracted.communities.communityAutomodFlagsPanel.failedToDismissTheAutomodFlag_0e50ec68',
        ),
      })
    } finally {
      setPendingPostId(null)
    }
  }

  return (
    <section
      className='space-y-3'
      aria-label={t('extracted.communities.communityAutomodFlagsPanel.automodFlags_b5fc56db')}
      data-pw='community-automod-flags-panel'
    >
      <div>
        <h3 className='text-lg font-semibold'>
          {t('extracted.communities.communityAutomodFlagsPanel.automodFlags_b5fc56db')}
        </h3>
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.communities.communityAutomodFlagsPanel.postsAutomodFlaggedForModeratorReview_90005619',
          )}
        </p>
      </div>
      <div className='overflow-hidden rounded-md border'>
        {visibleEntries.map(entry => (
          <article
            key={entry.entity_id}
            className='flex items-center justify-between gap-3 border-b p-4 last:border-b-0'
            data-pw='community-automod-flag-row'
          >
            <div className='min-w-0'>
              {entry.target_path ? (
                <Link
                  className='block truncate font-medium underline-offset-4 hover:underline'
                  href={entry.target_path}
                >
                  <FlaggedPostTitle entry={entry} />
                </Link>
              ) : (
                <span className='block truncate font-medium'>
                  <FlaggedPostTitle entry={entry} />
                </span>
              )}
            </div>
            <Button
              type='button'
              variant='outline'
              disabled={pendingPostId !== null || isRefreshing}
              onClick={() => dismiss(entry.entity_id)}
              data-pw='community-automod-flag-dismiss-button'
            >
              <CheckCircle2 className='size-4' />
              {t('extracted.communities.communityAutomodFlagsPanel.dismiss_48845bff')}
            </Button>
          </article>
        ))}
      </div>
    </section>
  )
}

function FlaggedPostTitle({ entry }: { entry: CommunityModerationQueueEntry }) {
  return (
    <PostContentText
      as='span'
      content={entry.target_content}
      fallback={entry.target_label}
    />
  )
}
