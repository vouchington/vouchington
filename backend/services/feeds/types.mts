import type { PostType } from '@services/posts/types'
import type { RssFeedItemsResult } from '@voucha/types/entities/rss-feed-item-search'
import type { PaginatedResult } from '@voucha/types/pagination'
import type { PaginatedResponse } from '@voucha/api/types'
import type { TimeRange } from '@voucha/types/feed'
import {
  VALID_POST_FEED_TYPES,
  VALID_RSS_FEED_ITEM_FEED_TYPES,
  type PostFeedType,
  type RssFeedItemFeedType,
} from '@ts-shared/feed-capabilities'

export { type TimeRange }
export {
  VALID_POST_FEED_TYPES,
  VALID_RSS_FEED_ITEM_FEED_TYPES,
  type PostFeedType,
  type RssFeedItemFeedType,
}

export type PostFeedOptions = {
  feed_type?: PostFeedType
  community_id?: string
  post_types?: PostType[]
  sort?: 'new' | 'hot'
  text_search_query?: string
  universal_topic_ids?: string[]
  hashtag_topic_ids?: string[]
  hashtag_alias_ids?: string[]
  has_unknown_hashtag?: boolean
  min_score_follow_users?: number // default: -5
  min_score_follow_topics?: number // default: 0
  time_range?: TimeRange // default: '1w' (1 week)
  limit?: number // default: 25, max: 100
  after?: string // Base64-encoded cursor
}

export type RssFeedItemFeedOptions = {
  feed_type?: RssFeedItemFeedType
  community_id?: string
  min_score_follow_rss_feeds?: number // default: -5
  min_score_follow_topics?: number // default: 0
  time_range?: TimeRange // default: '1w' (1 week)
  limit?: number // default: 25, max: 100
  after?: string // Base64-encoded cursor
  has_related_posts?: boolean // filter items with/without linked discussion posts
  media_types?: Array<'article' | 'audio' | 'video'>
  text_search_query?: string
  topic_ids?: string[]
  hashtag_topic_ids?: string[]
  hashtag_alias_ids?: string[]
  has_unknown_hashtag?: boolean
}

// Post feed result type
type PostFeedResult = PaginatedResult<'post'> & {
  entity_id: string
  post_type: string
  delivery_type: 'direct' | 'share'
  shared_by_user_id?: string
  shared_at?: Date
}

// RSS feed item result type alias
type RssFeedItemFeedResult = RssFeedItemsResult & {
  entity_id: string
  delivery_type: 'direct' | 'share'
  shared_by_user_id?: string
  shared_at?: Date
}

// Feed response types
export type PostFeedResponse = PaginatedResponse<PostFeedResult>
export type RssFeedItemFeedResponse = PaginatedResponse<RssFeedItemFeedResult>
