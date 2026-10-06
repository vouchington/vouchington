'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { HoverableCard } from '@/components/shared/hoverable-card'
import { TopicLogo } from '@/components/shared/topic-logo'
import { TopicAboutCopy } from '@/components/topics/topic-about-copy'
import { TopicCardFediverseRow } from '@/components/topics/topic-card-fediverse-row'
import { TopicCardMetrics } from '@/components/topics/topic-card-metrics'
import { ProvenanceBadges } from '@/components/provenance/provenance-badges'
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
const FollowButton = dynamic<Parameters<typeof FollowButtonComponent>[0]>(() =>
  import('@/components/shared/follow-button').then(mod => mod.FollowButton),
)
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
    | 'lingua_rs_detected_language'
    | 'logo_image_id'
    | 'logo_image_placement'
    | 'should_allow_reviews'
    | 'hostname'
    | 'provenance'
    | 'staff_provenance'
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
  const currentUserId = currentUser?.id

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
            <div className='mt-1 flex flex-wrap items-center gap-1.5'>
              <Badge
                variant='secondary'
                className='text-xs'
              >
                {t(getTopicTypeLabel(topic.topic_type))}
              </Badge>
              <ProvenanceBadges
                testIdPrefix='topic'
                provenance={topic.provenance}
                staffProvenance={topic.staff_provenance}
              />
            </div>

            {/* Fediverse instance software + trust badge row */}
            {topic.topic_type === 'fediverse_instance' && (
              <TopicCardFediverseRow
                topic={topic}
                hostnameElection={hostnameElection}
                fediverseInstance={fediverseInstance}
              />
            )}

            {/* Description */}
            <TopicAboutCopy
              markdown={topic.markdown}
              detectedLanguage={topic.lingua_rs_detected_language}
              className='mt-2 line-clamp-2 text-sm text-muted-foreground'
            />

            <TopicCardMetrics
              topic={topic}
              metrics={metrics}
            />

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
          {topic.logo_image_placement && (
            <TopicLogo
              placement={topic.logo_image_placement}
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
