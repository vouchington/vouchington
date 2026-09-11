'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { bookmarkEntity } from '@/lib/api/client/bookmarks'
import { ApiError } from '@/lib/api/error'
import { topicHref } from '@/lib/links/entity-href'
import type { Topic } from '@/types/api-responses/shared'
import { useTranslations } from '@/lib/i18n/use-translations'

export function RecommendedTopicsAsideContent({
  topics: initialTopics,
  initialBookmarks,
}: {
  topics: Topic[]
  initialBookmarks: Record<string, Record<string, boolean>>
}) {
  const t = useTranslations()
  const [dismissed, setDismissed] = useState<Set<string>>(
    () =>
      new Set(
        initialTopics.reduce<string[]>((acc, t) => {
          if (initialBookmarks[t.id]?.['dismiss_recommendation']) acc.push(t.id)
          return acc
        }, []),
      ),
  )
  const [followed, setFollowed] = useState<Set<string>>(
    () =>
      new Set(
        initialTopics.reduce<string[]>((acc, t) => {
          if (initialBookmarks[t.id]?.['follow']) acc.push(t.id)
          return acc
        }, []),
      ),
  )
  const blocked = new Set(
    initialTopics.reduce<string[]>((acc, t) => {
      if (initialBookmarks[t.id]?.['block']) acc.push(t.id)
      return acc
    }, []),
  )
  const [actionInFlight, setActionInFlight] = useState<Set<string>>(() => new Set())

  async function handleFollow(topicId: string) {
    if (actionInFlight.has(topicId)) return
    setActionInFlight(prev => new Set([...prev, topicId]))
    try {
      await bookmarkEntity('topic', topicId, 'follow')
      setFollowed(prev => new Set([...prev, topicId]))
    } catch (error) {
      /* c8 ignore next 2 -- error path requires injecting a follow failure */
      const message =
        error instanceof ApiError
          ? error.message
          : t('extracted.asides.recommendedTopicsAsideContent.failedToFollowTopic_82dd9258')
      toast.error(message)
    } finally {
      setActionInFlight(prev => {
        const next = new Set(prev)
        next.delete(topicId)
        return next
      })
    }
  }

  async function handleDismiss(topicId: string) {
    if (actionInFlight.has(topicId)) return
    setActionInFlight(prev => new Set([...prev, topicId]))
    try {
      await bookmarkEntity('topic', topicId, 'dismiss_recommendation')
      setDismissed(prev => new Set([...prev, topicId]))
    } catch (error) {
      /* c8 ignore next 2 -- error path requires injecting a dismiss failure */
      const message =
        error instanceof ApiError
          ? error.message
          : t('extracted.asides.recommendedTopicsAsideContent.failedToDismiss_78d9fad2')
      toast.error(message)
    } finally {
      setActionInFlight(prev => {
        const next = new Set(prev)
        next.delete(topicId)
        return next
      })
    }
  }

  const visibleTopics = initialTopics.filter(
    t => !dismissed.has(t.id) && !followed.has(t.id) && !blocked.has(t.id),
  )

  return (
    <Card className='p-4'>
      <h3
        data-pw='recommended-topics-aside-heading'
        className='mb-2 text-sm font-semibold'
      >
        {t('extracted.asides.recommendedTopicsAsideContent.recommendedTopics_5ed39dc3')}
      </h3>
      <ul className='space-y-1.5'>
        {visibleTopics.map(topic => (
          <li
            key={topic.id}
            className='flex min-w-0 items-center gap-2'
          >
            <Link
              href={topicHref(topic)}
              prefetch={false}
              className='min-w-0 flex-1 truncate text-sm text-primary hover:underline'
            >
              {topic.name}
            </Link>
            <div className='flex shrink-0 gap-1'>
              <Button
                size='touchSm'
                variant='outline'
                onClick={() => handleFollow(topic.id)}
                disabled={actionInFlight.has(topic.id)}
              >
                {t('extracted.asides.recommendedTopicsAsideContent.follow_641d1ef6')}
              </Button>
              <Button
                size='touchSm'
                variant='ghost'
                aria-label={t(
                  'extracted.asides.recommendedTopicsAsideContent.dismissTopicname_65a0aed1',
                  {
                    topicName: topic.name,
                  },
                )}
                onClick={() => handleDismiss(topic.id)}
                disabled={actionInFlight.has(topic.id)}
              >
                {t('extracted.asides.recommendedTopicsAsideContent.text_be64f28a')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Link
        href='/my/topics/dismissed-recommendations'
        prefetch={false}
        data-pw='recommended-topics-aside-dismissed-link'
        className='mt-3 block text-xs text-muted-foreground hover:underline'
      >
        {t('extracted.asides.recommendedTopicsAsideContent.viewDismissed_e12a6d16')}
      </Link>
    </Card>
  )
}
