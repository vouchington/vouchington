import type { ViewRssFeed } from '@voucha/types/entities/rss-feed'

export type SearchRssFeedsOptions = {
  topic_id?: string
  topic_ids?: string[]
  hashtag_topic_ids?: string[]
  topic_match?: 'any' | 'all'
  include_descendants?: boolean
  publisher_type_id?: string
  publisher_type_ids?: string[]
  publisher_type_match?: 'any' | 'all'
  current_user_id?: string
  is_enabled?: boolean | null
  discoverable?: boolean | null
  text_search_query?: string
  limit?: number
  /** Filter by feed type, e.g. 'podcast' to show only podcast feeds. */
  feed_type?: 'article' | 'podcast' | 'video' | 'mixed'
  /** Filter by Apple category topic ID (from rss_feed_categories.topic_id). */
  category_topic_id?: string
  /** Decoded browse-path cursor ID (UUID). Supplied by the route after validating `after`. */
  cursorId?: string
  /** `trending` ranks the feeds of `mv_trending_rss_feeds` for `time_range` by score, then id. */
  sort?: 'trending'
  time_range?: 'day' | 'week' | 'month'
  /** Decoded trending cursor score; paired with `cursorId` as the keyset `(score, id) <`. */
  cursorScore?: number
}

/** A search row; `cursor_score` is the trending score, present only for `sort: 'trending'`. */
export type RssFeedSearchRow = ViewRssFeed & { cursor_score?: number }

// Canonical definitions live in @voucha/types/entities/rss-feed (type-downed so
// @services/rss-feed-items can consume ViewRssFeed without depending on @services/rss-feeds,
// avoiding a workspace cycle).
export type { ViewRssFeed } from '@voucha/types/entities/rss-feed'
