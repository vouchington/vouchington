import { createHash } from 'node:crypto'
import {
  decodeScopedPreciseTimestampCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { RssFeedItemFeedOptions } from '../types.mts'
import { rssFeedItemPageDefaults } from './feed-page-config.mts'

type EffectiveFeedCursorOptions = RssFeedItemFeedOptions & {
  feed_type: NonNullable<RssFeedItemFeedOptions['feed_type']>
  time_range: NonNullable<RssFeedItemFeedOptions['time_range']>
  min_score_follow_rss_feeds: number
  min_score_follow_topics: number
  isAdministrator: boolean
}

type FeedCursorRow = { cursor_sort_at: string; cursor_id: string }
type FeedPageLimits = Record<keyof typeof rssFeedItemPageDefaults, number>

export function getRssFeedItemFeedCursorScope(
  currentUserId: string | undefined,
  options: EffectiveFeedCursorOptions,
  pageLimits: FeedPageLimits = rssFeedItemPageDefaults,
): string {
  const scope = {
    resource: 'rss-feed-item-feed',
    order: 'sort_at:desc,id:desc',
    viewer: currentUserId ?? null,
    administrator: currentUserId ? options.isAdministrator : false,
    community: options.community_id ?? null,
    feed_type: options.feed_type,
    time_range: options.time_range,
    min_score_follow_rss_feeds: options.min_score_follow_rss_feeds,
    min_score_follow_topics: options.min_score_follow_topics,
    has_related_posts: options.has_related_posts ?? null,
    has_hacker_news_references: options.has_hacker_news_references ?? null,
    media_types: normalizeArray(options.media_types),
    topic_ids: normalizeArray(options.topic_ids),
    hashtag_topic_ids: normalizeArray(options.hashtag_topic_ids),
    hashtag_alias_ids: normalizeArray(options.hashtag_alias_ids),
    text_search_query: options.text_search_query?.trim() ?? '',
    has_unknown_hashtag: options.has_unknown_hashtag ?? false,
    page_limits: pageLimits,
  }
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex')
}

export function parseRssFeedItemFeedCursor(
  after: string | undefined,
  scope: string,
): {
  sort_at_lt?: string
  id_lt?: string
} {
  if (!after) return {}
  const message = 'Invalid cursor format for RSS feed item feed'
  const cursor = decodeScopedPreciseTimestampCursor(after, scope, message)
  return { sort_at_lt: cursor.timestamp, id_lt: cursor.id }
}

export function buildRssFeedItemFeedPageInfo(
  rows: FeedCursorRow[],
  hasNextPage: boolean,
  scope: string,
): PageInfo {
  const encode = (row: FeedCursorRow) =>
    encodeScopedPreciseTimestampCursor(row.cursor_sort_at, row.cursor_id, scope)
  return {
    has_next_page: hasNextPage,
    start_cursor: rows.length > 0 ? encode(rows[0]) : null,
    end_cursor: hasNextPage && rows.length > 0 ? encode(rows.at(-1)!) : null,
  }
}

function normalizeArray(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].toSorted()
}
