import { encodeCursor, decodeCursor, isTimestampCursor } from '@modules/pagination'
import { getMinUUIDv7ForDate, isUUID } from '@modules/utils'
import type { TimeRange } from '../types.mts'
import { getTimeRangeLowerBoundDate } from '../time-range-utils.mts'
import createHttpError from 'http-errors'
import sql, { type SQLStatement } from 'sql-template-strings'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'

export function appendRelatedPostsFilter(
  query: SQLStatement,
  hasRelatedPosts: boolean | undefined,
  currentUserId?: string,
  isAdministrator = false,
  rssFeedItemUrlId: SQLStatement = sql`rss_feed_items.url_id`,
) {
  const eligibility = currentUserId
    ? buildViewerPostDiscoveryEligibilityFilter('related_post', 'related_root_post', {
        currentUserId,
        isAdministrator,
      })
    : buildPublicPostEligibilityFilter('related_post', 'related_root_post')
  if (hasRelatedPosts === true) {
    query.append(sql`
        AND (
          EXISTS (
            SELECT 1
            FROM "relation__post__related__url" rel
            JOIN posts related_post ON related_post.id = rel.subject_id
            JOIN posts related_root_post
              ON related_root_post.id = COALESCE(related_post.root_id, related_post.id)
            WHERE rel.object_id = `)
    query.append(rssFeedItemUrlId).append(sql`
              AND rel.deleted_at IS NULL
              AND rel.votes_score_net > 0
              AND `)
    query.append(eligibility).append(sql`
          )
          OR EXISTS (
            SELECT 1
            FROM posts related_post
            JOIN posts related_root_post
              ON related_root_post.id = COALESCE(related_post.root_id, related_post.id)
            WHERE related_post.post_type = 'link'
              AND related_post.url_id = `)
    query.append(rssFeedItemUrlId).append(sql`
              AND `)
    query.append(eligibility).append(sql`
          )
        )
    `)
    return
  }

  if (hasRelatedPosts === false) {
    query.append(sql`
        AND NOT EXISTS (
          SELECT 1
          FROM "relation__post__related__url" rel
          JOIN posts related_post ON related_post.id = rel.subject_id
          JOIN posts related_root_post
            ON related_root_post.id = COALESCE(related_post.root_id, related_post.id)
          WHERE rel.object_id = `)
    query.append(rssFeedItemUrlId).append(sql`
            AND rel.deleted_at IS NULL
            AND rel.votes_score_net > 0
            AND `)
    query.append(eligibility).append(sql`
        )
        AND NOT EXISTS (
          SELECT 1
          FROM posts related_post
          JOIN posts related_root_post
            ON related_root_post.id = COALESCE(related_post.root_id, related_post.id)
          WHERE related_post.post_type = 'link'
            AND related_post.url_id = `)
    query.append(rssFeedItemUrlId).append(sql`
            AND `)
    query.append(eligibility).append(sql`
        )
    `)
  }
}

export function parseRssFeedItemFeedCursor(after?: string): {
  published_lt?: number
  item_id_lt?: string
  share_event_id_lt?: string
} {
  if (!after) return {}

  const cursor = decodeCursor(after)
  if (!isTimestampCursor(cursor)) {
    throw createHttpError(400, 'Invalid cursor format for RSS feed item feed')
  }

  // Share cursors are encoded as "share:<share_event_uuid>" to distinguish them
  // from direct item cursors, which use the plain item UUID.
  if (cursor.id.startsWith('share:')) {
    const shareEventId = cursor.id.slice('share:'.length)
    if (!isUUID(shareEventId)) {
      throw createHttpError(400, 'Invalid cursor format for RSS feed item feed')
    }
    return { published_lt: cursor.timestamp, share_event_id_lt: shareEventId }
  }

  if (!isUUID(cursor.id)) {
    throw createHttpError(400, 'Invalid cursor format for RSS feed item feed')
  }

  return { published_lt: cursor.timestamp, item_id_lt: cursor.id }
}

export function getCutoffDateForTimeRange(timeRange: TimeRange): {
  cutoffDate: Date | null
  itemCutoffId: string | null
} {
  const cutoffDate = getTimeRangeLowerBoundDate(timeRange)
  if (!cutoffDate) {
    return { cutoffDate: null, itemCutoffId: null }
  }

  return {
    cutoffDate,
    itemCutoffId: getMinUUIDv7ForDate(cutoffDate),
  }
}

export function buildRssFeedItemFeedPageInfo(
  rows: Array<{ sort_at: Date | string | null; result_id: string; cursor_id: string }>,
  hasNextPage: boolean,
) {
  const firstRow = rows[0]
  const lastRow = rows.at(-1)
  const firstTimestamp = firstRow?.sort_at ? new Date(firstRow.sort_at).getTime() : null
  const lastTimestamp = lastRow?.sort_at ? new Date(lastRow.sort_at).getTime() : null

  return {
    has_next_page: hasNextPage,
    start_cursor:
      firstTimestamp === null
        ? null
        : encodeCursor({ timestamp: firstTimestamp, id: firstRow.cursor_id }),
    end_cursor:
      hasNextPage && lastTimestamp !== null
        ? encodeCursor({ timestamp: lastTimestamp, id: lastRow!.cursor_id })
        : null,
  }
}
