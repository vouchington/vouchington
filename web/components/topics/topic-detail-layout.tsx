import { TopicDetailHeader } from './topic-detail-header'
import { TopicDetailTabs } from './topic-detail-tabs'
import type { ElectionVote } from '@/types/posts'
import type { Topic, TopicElection, TopicMetrics } from '@/types/topics'
import type { FediverseInstanceAttributes } from '@/types/fediverse-instances'
import type { HostnameElection } from '@/types/hostnames'
import { FediverseInstanceMetadata } from './fediverse-instance-metadata'

export interface TopicDetailLayoutProps {
  topic: Topic
  metrics?: Partial<TopicMetrics>
  election?: TopicElection | null
  electionVote?: ElectionVote | null
  topicType: string
  isFollowing?: boolean
  isAuthenticated?: boolean
  isAdmin?: boolean
  canViewCrawlHistory?: boolean
  rssFeedId?: string
  isFollowingRssFeed?: boolean
  displayName?: string
  fediverseInstance?: FediverseInstanceAttributes | null
  hostnameElection?: HostnameElection | null
  children: React.ReactNode
}

// oxlint-disable-next-line react-doctor/no-many-boolean-props -- established component API
export function TopicDetailLayout({
  topic,
  metrics,
  election,
  electionVote,
  topicType,
  isFollowing,
  isAuthenticated,
  isAdmin,
  canViewCrawlHistory,
  rssFeedId,
  isFollowingRssFeed,
  displayName,
  fediverseInstance,
  hostnameElection,
  children,
}: TopicDetailLayoutProps) {
  return (
    <div className='space-y-4'>
      <TopicDetailHeader
        topic={topic}
        metrics={metrics}
        election={election}
        electionVote={electionVote}
        isFollowing={isFollowing}
        rssFeedId={rssFeedId}
        isFollowingRssFeed={isFollowingRssFeed}
        displayName={displayName}
      />
      {topic.topic_type === 'fediverse_instance' && (
        <FediverseInstanceMetadata
          topic={topic}
          attributes={fediverseInstance ?? null}
          hostnameElection={hostnameElection ?? null}
        />
      )}
      <TopicDetailTabs
        topicType={topicType}
        topicId={topic.id}
        topicSlug={topic.slug}
        metrics={metrics}
        topicTypeName={topic.topic_type}
        allowReviews={topic.allow_reviews}
        referralProgramId={topic.referral_program_id}
        isAuthenticated={isAuthenticated}
        isAdmin={isAdmin}
        canViewCrawlHistory={canViewCrawlHistory}
      />
      <div>{children}</div>
    </div>
  )
}
