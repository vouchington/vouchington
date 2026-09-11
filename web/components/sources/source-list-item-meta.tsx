'use client'

import Link from 'next/link'
import { DomainTrustBadge } from '@/components/domains/domain-trust-badge'
import { TopicVouchDisavowVote } from '@/components/topics/topic-vouch-disavow-vote'
import { TopicLabel } from '@/components/topics/topic-label'
import { topicHref } from '@/lib/links/entity-href'
import { useAuth } from '@/lib/auth/context'
import type { RssFeedTopicElection, ViewRssFeed } from '@/types/rss-feeds'
import type { HostnameElection } from '@/types/hostnames'
import { RssFeedActionSlot, type RssFeedListItemAction } from './rss-feed-action-slot'
import { useTranslations } from '@/lib/i18n/use-translations'

interface SourceListItemMetaProps {
  feed: ViewRssFeed
  action?: RssFeedListItemAction
  isFollowing: boolean
  isFollowingTopic: boolean
  hostnameElection?: HostnameElection
  topicElection?: RssFeedTopicElection
  electionVoteChoice?: import('@/lib/api/client/elections').SentimentChoice
  refreshOnUnfollow?: boolean
}

export function SourceListItemMeta({
  feed,
  action,
  isFollowing,
  isFollowingTopic,
  hostnameElection,
  topicElection,
  electionVoteChoice,
  refreshOnUnfollow,
}: SourceListItemMetaProps) {
  const t = useTranslations()
  const { isAuthenticated } = useAuth()
  return (
    <div className='mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
      {feed.hostname ? (
        <DomainTrustBadge
          scoreNet={hostnameElection?.votes_score_net ?? 0}
          countUp={hostnameElection?.votes_count_up ?? 0}
          countDown={hostnameElection?.votes_count_down ?? 0}
          hostname={feed.hostname.hostname}
          href={topicHref(feed.topic, 'reviews')}
          size='xs'
        />
      ) : (
        <Link
          href={topicHref(feed.topic, 'reviews')}
          prefetch={false}
          className='text-muted-foreground hover:underline'
        >
          {t('extracted.sources.sourceListItemMeta.unrated_c29bb93b')}
        </Link>
      )}
      {feed.publisher_type && (
        <TopicLabel
          topic={feed.publisher_type}
          className='text-xs'
        />
      )}
      {topicElection && (
        <TopicVouchDisavowVote
          electionId={topicElection.id}
          countUp={topicElection.votes_count_up}
          countDown={topicElection.votes_count_down}
          existingVoteChoice={electionVoteChoice}
          signedOut={!isAuthenticated}
        />
      )}
      <RssFeedActionSlot
        feed={feed}
        action={action ?? { kind: 'follow' }}
        isFollowing={isFollowing}
        isFollowingTopic={isFollowingTopic}
        refreshOnUnfollow={refreshOnUnfollow}
      />
    </div>
  )
}
