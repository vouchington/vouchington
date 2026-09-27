import { createHash } from 'node:crypto'
import {
  decodeScopedPreciseTimestampCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { SearchRssFeedItemsOptions } from './search.mts'

export function getRssFeedItemSearchCursorScope(options: SearchRssFeedItemsOptions): string {
  const scope = {
    resource: 'rss-feed-items-recency-search',
    order: 'published_at:desc,id:desc',
    viewer: options.currentUserId ?? null,
    administrator: options.currentUserId ? (options.isAdministrator ?? false) : false,
    rss_feed_ids: normalizeArray(options.rss_feed_ids),
    topic_ids: normalizeArray(options.topic_ids),
    category_topic_ids: normalizeArray(options.category_topic_ids),
    hashtag_topic_ids: normalizeArray(options.hashtag_topic_ids),
    hashtag_alias_ids: normalizeArray(options.hashtag_alias_ids),
    media_types: normalizeArray(options.media_types),
    story_id: options.story_id ?? null,
    has_related_posts: options.has_related_posts ?? null,
    read: options.currentUserId ? (options.read ?? null) : null,
    text_search_query: options.text_search_query?.trim() ?? '',
  }
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex')
}

export function getRssFeedItemSearchCursor(options: SearchRssFeedItemsOptions) {
  if (!options.after) return null
  return decodeScopedPreciseTimestampCursor(
    options.after,
    getRssFeedItemSearchCursorScope(options),
    'Invalid cursor format: expected scoped precise timestamp cursor',
  )
}

export function buildRssFeedItemSearchPageInfo(
  rows: Array<{ id: string; cursor_published_at: string }>,
  hasNextPage: boolean,
  scope: string,
): PageInfo {
  const encode = (row: { id: string; cursor_published_at: string }) =>
    encodeScopedPreciseTimestampCursor(row.cursor_published_at, row.id, scope)
  return {
    has_next_page: hasNextPage,
    start_cursor: rows.length > 0 ? encode(rows[0]) : null,
    end_cursor: hasNextPage && rows.length > 0 ? encode(rows.at(-1)!) : null,
  }
}

function normalizeArray(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort()
}
