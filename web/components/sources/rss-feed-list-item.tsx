import type { ViewRssFeed, RssFeedTopicElection } from '@/types/rss-feeds'
import type { HostnameElection } from '@/types/hostnames'
import type { RssFeedListItemAction } from './rss-feed-action-slot'
import { ArticleListItem } from './article-list-item'
import { VideoListItem } from './video-list-item'
import { PodcastListItem } from '@/components/podcasts/podcast-list-item'

export type { RssFeedListItemAction } from './rss-feed-action-slot'

export interface RssFeedListItemProps {
  feed: ViewRssFeed
  action?: RssFeedListItemAction
  isFollowing?: boolean
  isFollowingTopic?: boolean
  hostnameElection?: HostnameElection
  topicElection?: RssFeedTopicElection
  electionVoteChoice?: import('@/lib/api/client/elections').SentimentChoice
  refreshOnUnfollow?: boolean
}

export function RssFeedListItem({
  feed,
  action,
  isFollowing = false,
  isFollowingTopic = false,
  hostnameElection,
  topicElection,
  electionVoteChoice,
  refreshOnUnfollow,
}: RssFeedListItemProps) {
  if (feed.feed_type === 'podcast') {
    return (
      <PodcastListItem
        feed={feed}
        action={action}
        isFollowing={isFollowing}
        isFollowingTopic={isFollowingTopic}
        hostnameElection={hostnameElection}
        topicElection={topicElection}
        electionVoteChoice={electionVoteChoice}
        refreshOnUnfollow={refreshOnUnfollow}
      />
    )
  }
  if (feed.feed_type === 'video') {
    return (
      <VideoListItem
        feed={feed}
        action={action}
        isFollowing={isFollowing}
        isFollowingTopic={isFollowingTopic}
        hostnameElection={hostnameElection}
        topicElection={topicElection}
        electionVoteChoice={electionVoteChoice}
        refreshOnUnfollow={refreshOnUnfollow}
      />
    )
  }
  return (
    <ArticleListItem
      feed={feed}
      action={action}
      isFollowing={isFollowing}
      isFollowingTopic={isFollowingTopic}
      hostnameElection={hostnameElection}
      topicElection={topicElection}
      electionVoteChoice={electionVoteChoice}
      refreshOnUnfollow={refreshOnUnfollow}
    />
  )
}
