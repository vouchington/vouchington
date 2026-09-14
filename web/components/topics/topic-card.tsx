'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { HoverableCard } from '@/components/shared/hoverable-card'
import { TopicLogo } from '@/components/shared/topic-logo'
import { TopicCardFediverseRow } from '@/components/topics/topic-card-fediverse-row'
import { Users, Star } from 'lucide-react'
import { formatCompactNumber, calculateAverageRating } from '@ts-shared/utils/format'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import {
  getTopicTypeLabel,
  type Topic,
  type TopicElection,
  type TopicMetrics,
} from '@/types/topics'
import type { HostnameElection } from '@/types/hostnames'
import type { FediverseInstanceAttributes } from '@/types/fediverse-instances'
import { topicHref } from '@/lib/links/entity-href'
import { ScoreVote } from '@/components/votes/score-vote'
import { clearTopicVote, submitTopicVote } from '@/lib/api/client/elections'
import { useAuth } from '@/lib/auth/context'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { EntityBookmarkButton as EntityBookmarkButtonComponent } from '@/components/shared/entity-bookmark-button'
import type { FollowButton as FollowButtonComponent } from '@/components/shared/follow-button'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const FollowButton = dynamic<Parameters<typeof FollowButtonComponent>[0]>(() =>
  import('@/components/shared/follow-button').then(mod => mod.FollowButton),
)
// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const EntityBookmarkButton = dynamic<Parameters<typeof EntityBookmarkButtonComponent>[0]>(() =>
  import('@/components/shared/entity-bookmark-button').then(mod => mod.EntityBookmarkButton),
)

export interface TopicCardProps {
  topic: Pick<
    Topic,
    | 'id'
    | 'name'
    | 'slug'
    | 'topic_type'
    | 'markdown'
    | 'logo_image_id'
    | 'allow_reviews'
    | 'hostname'
  >
  metrics?: Pick<TopicMetrics, 'ratings' | 'bookmarks'>
  election?: Pick<TopicElection, 'id' | 'votes_count_up' | 'votes_count_down'>
  isFollowing?: boolean
  isMuted?: boolean
  electionVoteChoice?: import('@/lib/api/client/elections').SentimentChoice
  hideBookmarkActions?: boolean
  /** fediverse_instance only — hostname trust-vote data for the trust badge; "Unrated" until a caller supplies it. */
  hostnameElection?: HostnameElection
  fediverseInstance?: FediverseInstanceAttributes
}

export function TopicCard({
  topic,
  metrics,
  election,
  isFollowing,
  isMuted,
  electionVoteChoice,
  hideBookmarkActions,
  hostnameElection,
  fediverseInstance,
}: TopicCardProps) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  const uiLocale = useUiLocale()
  const currentUserId = currentUser?.id
  const averageRating = metrics?.ratings ? calculateAverageRating(metrics.ratings.count) : null
  const followerCount = metrics?.bookmarks.follow || 0
  const reviewCount = metrics?.ratings
    ? Object.values(metrics.ratings.count).reduce((sum, count) => sum + count, 0)
    : 0

  return (
    <HoverableCard
      data-pw='topic-card'
      className='overflow-hidden p-0'
    >
      <div className='p-4'>
        <div className='flex items-start gap-3'>
          <div className='min-w-0 flex-1'>
            {/* Topic name */}
            <h3 className='text-lg font-semibold'>
              <Link
                prefetch={false}
                href={topicHref(topic)}
                className='hover:underline'
              >
                {topic.name}
              </Link>
            </h3>

            {/* Topic type badge — below title per UI rules */}
            <Badge
              variant='secondary'
              className='mt-1 text-xs'
            >
              {t(getTopicTypeLabel(topic.topic_type))}
            </Badge>

            {/* Fediverse instance software + trust badge row */}
            {topic.topic_type === 'fediverse_instance' && (
              <TopicCardFediverseRow
                topic={topic}
                hostnameElection={hostnameElection}
                fediverseInstance={fediverseInstance}
              />
            )}

            {/* Description */}
            {topic.markdown && (
              <p className='mt-2 line-clamp-2 text-sm text-muted-foreground'>
                {topic.markdown.slice(0, 200)}
              </p>
            )}

            {/* Metrics */}
            <div className='mt-2 flex items-center gap-4 text-sm text-muted-foreground'>
              {/* Average rating — hidden for topics that don't allow reviews */}
              {topic.allow_reviews && averageRating !== null && (
                <div className='flex items-center gap-1'>
                  <Star className='h-4 w-4 fill-yellow-400 text-yellow-400' />
                  <span>{averageRating.toFixed(1)}</span>
                </div>
              )}

              {/* Review count — hidden for topics that don't allow reviews */}
              {topic.allow_reviews && reviewCount > 0 && (
                <span>{formatCompactNumber(reviewCount, uiLocale)} reviews</span>
              )}

              {/* Follower count */}
              {followerCount > 0 && (
                <div className='flex items-center gap-1'>
                  <Users className='h-4 w-4' />
                  <span>{formatCompactNumber(followerCount, uiLocale)} followers</span>
                </div>
              )}
            </div>

            {/* Action buttons — vote visible for all; follow/mute suppressed in passive mode */}
            {(!hideBookmarkActions || !!election) && (
              <div className='relative z-10 mt-2 flex items-center gap-2'>
                {election && (
                  <ScoreVote
                    entityType='topic'
                    electionId={election.id}
                    countUp={election.votes_count_up}
                    countDown={election.votes_count_down}
                    existingVoteChoice={electionVoteChoice}
                    submitVote={(id, choice) =>
                      submitTopicVote(
                        id,
                        choice as import('@/lib/api/client/elections').SentimentChoice,
                      )
                    }
                    clearVote={clearTopicVote}
                    signedOut={!currentUserId}
                  />
                )}
                {!hideBookmarkActions && (
                  <FollowButton
                    entityType='topic'
                    entityId={topic.id}
                    isFollowing={isFollowing}
                    tooltip={t('extracted.topics.topicCard.followThisTopicToSeeIts_34a6d300')}
                  />
                )}
                {!hideBookmarkActions && currentUserId && (
                  <EntityBookmarkButton
                    entityType='topic'
                    entityId={topic.id}
                    preset='mute'
                    initialActive={isMuted}
                    tooltip={t('extracted.topics.topicCard.hideThisTopicFromYourFeed_fd153c8d')}
                  />
                )}
              </div>
            )}
          </div>
          {topic.logo_image_id && (
            <TopicLogo
              imageId={topic.logo_image_id}
              name={topic.name}
              className='h-10 w-10 flex-shrink-0 rounded-lg object-contain'
              width={80}
            />
          )}
        </div>
      </div>
    </HoverableCard>
  )
}
