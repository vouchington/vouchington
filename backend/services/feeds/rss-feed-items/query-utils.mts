import { getMinUUIDv7ForDate } from '@modules/utils'
import type { TimeRange } from '../types.mts'
import { getTimeRangeLowerBoundDate } from '../time-range-utils.mts'
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
