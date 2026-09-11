'use client'

import Link from 'next/link'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { EntityBookmarkButton } from '@/components/shared/entity-bookmark-button'
import { RssFeedLink } from '@/components/shared/rss-feed-link'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/lib/auth/context'
import { useLoginHref } from '@/hooks/use-login-href'
import type { TopicTypes } from '@/types/topics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TopicActionsAsideProps {
  topicId: string
  topicType: TopicTypes
  topicSlug: string
  allowReviews?: boolean
  isMuted?: boolean
}

const DATA_POINT_ELIGIBLE_TYPES = new Set<TopicTypes>(['card', 'bank_account'])

export function TopicActionsAside({
  topicId,
  topicType,
  allowReviews,
  topicSlug,
  isMuted,
}: TopicActionsAsideProps) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  const muteLoginHref = useLoginHref('mute')
  const showReview = allowReviews !== false
  const showDataPoint = DATA_POINT_ELIGIBLE_TYPES.has(topicType)
  const topicParam = `?topic_id=${encodeURIComponent(topicId)}`
  /* c8 ignore start -- icon aliases are covered by Vitest; selected browser coverage does not visit topic aside actions */
  const ShareDataPointIcon = EntityActionIcons.shareDataPoint
  const StartDiscussionIcon = EntityActionIcons.startDiscussion
  const WriteReviewIcon = EntityActionIcons.writeReview
  /* c8 ignore stop */

  return (
    <Card className='p-4'>
      <h3 className='text-sm font-semibold'>
        {t('extracted.topics.topicActionsAside.actions_ff8059dc')}
      </h3>
      <ButtonGroup className='mt-3'>
        {/* RSS Feed link renders in both signed-in (as button) and signed-out (full-width label) states */}
        <RssFeedLink
          href={`/rss/posts?topics=${encodeURIComponent(topicSlug)}`}
          label={t('extracted.topics.topicActionsAside.rssFeed_7f1ae116')}
          asButton={!!currentUser}
          withLabel={!currentUser}
          data-pw='topic-rss-feed-aside'
        />
        {currentUser ? (
          <EntityBookmarkButton
            entityType='topic'
            entityId={topicId}
            preset='mute'
            size='touchSm'
            initialActive={isMuted}
            tooltip={t('extracted.topics.topicActionsAside.hideThisTopicFromYourFeed_fd153c8d')}
          />
        ) : (
          <Button
            variant='outline'
            size='touchSm'
            asChild
          >
            <Link
              href={muteLoginHref}
              data-pw='topic-mute-login-link'
            >
              {t('extracted.topics.topicActionsAside.mute_8dd6857b')}
            </Link>
          </Button>
        )}
      </ButtonGroup>
      {currentUser && (
        <div className='border-t mt-3 pt-3'>
          <p className='mb-2 text-xs text-muted-foreground'>
            {t('extracted.topics.topicActionsAside.contribute_97b0c61b')}
          </p>
          <div className='flex flex-col gap-1'>
            {showReview && (
              <Button
                variant='ghost'
                size='sm'
                className='h-auto justify-start gap-2 px-2 py-2'
                asChild
              >
                <Link
                  href={`/reviews/create${topicParam}`}
                  prefetch={false}
                >
                  <WriteReviewIcon data-icon='inline-start' />
                  {t('extracted.topics.topicActionsAside.writeAReview_95627b89')}
                </Link>
              </Button>
            )}
            {showDataPoint && (
              <Button
                variant='ghost'
                size='sm'
                className='h-auto justify-start gap-2 px-2 py-2'
                asChild
              >
                <Link
                  href={`/data-points/create${topicParam}`}
                  prefetch={false}
                >
                  <ShareDataPointIcon data-icon='inline-start' />
                  {t('extracted.topics.topicActionsAside.shareADataPoint_9215baa0')}
                </Link>
              </Button>
            )}
            <Button
              variant='ghost'
              size='sm'
              className='h-auto justify-start gap-2 px-2 py-2'
              asChild
            >
              <Link
                href={`/discussions/create${topicParam}`}
                prefetch={false}
              >
                <StartDiscussionIcon data-icon='inline-start' />
                {t('extracted.topics.topicActionsAside.startADiscussion_b007cae1')}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
