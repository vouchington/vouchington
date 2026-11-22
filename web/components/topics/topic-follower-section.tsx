'use client'

import { useState } from 'react'
import { formatNumber } from '@ts-shared/utils/format'
import { FollowContextUserList } from '@/components/social/follow-context-card'
import { Button } from '@/components/ui/button'
import { fetchTopicFollowContext } from '@/lib/api/client/topics'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError from '@/lib/on-error'
import type { TopicFollowerContext } from '@/types/api-responses'

const FOLLOWER_PREVIEW_SIZE = 5

export function TopicFollowerSection({
  topicId,
  title,
  initialPage,
}: {
  topicId: string
  title: string
  initialPage: Pick<TopicFollowerContext, 'total' | 'users' | 'next_cursor'>
}) {
  const t = useTranslations()
  const locale = useUiLocale()
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const lowerBound = Math.max(page.total, page.users.length)
  const canContinue = page.next_cursor !== null && page.users.length < FOLLOWER_PREVIEW_SIZE

  async function keepLooking(): Promise<void> {
    if (page.next_cursor === null || loading || !canContinue) return
    setLoading(true)
    setFailed(false)
    try {
      const { following_topic_followers: next } = await fetchTopicFollowContext(
        topicId,
        page.next_cursor,
      )
      setPage(previous => {
        const users = new Map(previous.users.map(user => [user.id, user]))
        for (const user of next.users) users.set(user.id, user)
        return {
          users: [...users.values()].slice(0, FOLLOWER_PREVIEW_SIZE),
          // A continuation describes a suffix. Only the initial page can report an exact total.
          total: Math.max(previous.total, next.total, users.size),
          next_cursor: next.next_cursor,
        }
      })
    } catch (err) {
      onError(err, { fallback: t('extracted.topics.topicFollowerSection.loadFailed') })
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className='space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <h3 className='text-sm font-medium'>{title}</h3>
        {lowerBound > 0 && (
          <span className='text-xs text-muted-foreground'>
            {t('extracted.topics.topicFollowerSection.lowerBoundCount', {
              count: formatNumber(lowerBound, locale),
            })}
          </span>
        )}
      </div>
      {page.users.length > 0 ? (
        <FollowContextUserList users={page.users} />
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.topics.topicFollowerSection.noMatchesYet')}
        </p>
      )}
      {canContinue && (
        <Button
          variant='outline'
          size='sm'
          disabled={loading}
          onClick={keepLooking}
        >
          {loading
            ? t('extracted.shared.paginatedListFooter.loading_ba3bbbe1')
            : failed
              ? t('extracted.shared.paginatedListFooter.retry_942087cc')
              : t('extracted.topics.topicFollowerSection.keepLooking')}
        </Button>
      )}
    </section>
  )
}
