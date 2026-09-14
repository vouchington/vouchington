'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Star } from 'lucide-react'
import { calculateAverageRating } from '@ts-shared/utils/format'
import { TopicLogo } from '@/components/shared/topic-logo'
import { TopicVouchDisavowVote } from '@/components/topics/topic-vouch-disavow-vote'
import { useAuth } from '@/lib/auth/context'
import type { ElectionVote } from '@/types/posts'
import {
  getTopicTypeLabel,
  type Topic,
  type TopicElection,
  type TopicMetrics,
} from '@/types/topics'
import { topicHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { FollowButton as FollowButtonComponent } from '@/components/shared/follow-button'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const FollowButton = dynamic<Parameters<typeof FollowButtonComponent>[0]>(() =>
  import('@/components/shared/follow-button').then(mod => mod.FollowButton),
)

interface TopicDetailHeaderProps {
  topic: Pick<Topic, 'id' | 'name' | 'slug' | 'topic_type' | 'logo_image_id'>
  metrics?: Pick<Partial<TopicMetrics>, 'ratings'>
  election?: Pick<TopicElection, 'id' | 'votes_count_up' | 'votes_count_down'> | null
  electionVote?: Pick<ElectionVote, 'choice'> | null
  isFollowing?: boolean
  rssFeedId?: string
  isFollowingRssFeed?: boolean
  displayName?: string
}

export function TopicDetailHeader({
  topic,
  metrics,
  election,
  electionVote,
  isFollowing,
  rssFeedId,
  isFollowingRssFeed,
  displayName,
}: TopicDetailHeaderProps) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  const currentUserId = currentUser?.id
  const averageRating = metrics?.ratings ? calculateAverageRating(metrics.ratings.count) : null

  return (
    <div
      data-pw='topic-detail-header'
      className='space-y-4'
    >
      <div className='flex items-start gap-3 sm:gap-4'>
        {topic.logo_image_id && (
          <div>
            <TopicLogo
              imageId={topic.logo_image_id}
              name={displayName ?? topic.name}
            />
          </div>
        )}
        <div>
          <h1 className='text-xl font-bold sm:text-2xl md:text-3xl'>
            <Link
              href={topicHref(topic)}
              prefetch={false}
              className='hover:underline focus-visible:underline'
            >
              {displayName ?? topic.name}
            </Link>
          </h1>
        </div>
      </div>

      <Badge variant='secondary'>{t(getTopicTypeLabel(topic.topic_type))}</Badge>

      <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground sm:gap-4'>
        {averageRating !== null && (
          <div className='flex items-center gap-1'>
            <Star className='h-4 w-4 fill-yellow-400 text-yellow-400' />
            <span>{averageRating.toFixed(1)}</span>
          </div>
        )}
        {election && (
          <TopicVouchDisavowVote
            electionId={election.id}
            countUp={election.votes_count_up ?? 0}
            countDown={election.votes_count_down ?? 0}
            existingVoteChoice={
              electionVote?.choice as
                | import('@/lib/api/client/elections').SentimentChoice
                | undefined
            }
            signedOut={!currentUserId}
          />
        )}
        <div className='flex flex-wrap items-center gap-2'>
          {/* Source topics: show Follow Source + Follow Topic as two distinct primary actions */}
          {topic.topic_type === 'rss_feed' && rssFeedId ? (
            <>
              <FollowButton
                entityType='rss_feed'
                entityId={rssFeedId}
                isFollowing={isFollowingRssFeed}
                inactiveLabel={t('extracted.topics.topicDetailHeader.followSource_b91a62b0')}
                activeLabel={t('extracted.topics.topicDetailHeader.followingSource_61443d49')}
                tooltip={t('extracted.topics.topicDetailHeader.followThisSourceToSeeIts_19f3a38d')}
                data-pw='follow-source-button'
              />
              <FollowButton
                entityType='topic'
                entityId={topic.id}
                isFollowing={isFollowing}
                inactiveLabel={t('extracted.topics.topicDetailHeader.followTopic_afc9d3f8')}
                activeLabel={t('extracted.topics.topicDetailHeader.followingTopic_e101254e')}
                tooltip={t('extracted.topics.topicDetailHeader.followThisTopicToSeeIts_34a6d300')}
                data-pw='follow-topic-button'
              />
            </>
          ) : (
            <FollowButton
              entityType='topic'
              entityId={topic.id}
              isFollowing={isFollowing}
              tooltip={t('extracted.topics.topicDetailHeader.followThisTopicToSeeIts_34a6d300')}
            />
          )}
        </div>
      </div>
    </div>
  )
}
