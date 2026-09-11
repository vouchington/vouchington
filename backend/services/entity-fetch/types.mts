import type { Topic, TopicMetrics } from '@services/topics/types'
import type { Post, PostMetrics } from '@services/posts/types'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import type { ElectionVote } from '@services/elections-votes/shared'
import type { ViewPostElection } from '@services/elections-votes/post'
import type { ViewRssFeedItemElection } from '@services/elections-votes/rss-feed-item'

type ElectionVotesById = Record<string, ElectionVote>
export type BookmarksById = Record<string, Record<string, boolean>>

type EntityFetchResult<TEntity, TMetrics> = {
  entities: Record<string, TEntity>
  entity_metrics: Record<string, TMetrics>
  bookmarks?: BookmarksById
  election_votes?: ElectionVotesById
}

export type TopicFetchResult = EntityFetchResult<Topic, TopicMetrics>
export type PostFetchResult = EntityFetchResult<Post, PostMetrics> & {
  post_elections: Record<string, ViewPostElection>
}
export type RssFeedItemFetchResult = EntityFetchResult<ViewRssFeedItem, never> & {
  rss_feed_item_elections: Record<string, ViewRssFeedItemElection>
}
