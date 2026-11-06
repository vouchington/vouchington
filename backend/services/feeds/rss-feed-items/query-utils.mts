import { getMinUUIDv7ForDate } from '@modules/utils'
import type { TimeRange } from '../types.mts'
import { getTimeRangeLowerBoundDate } from '../time-range-utils.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import { getRssFeedItemPageLimit } from './feed-page-config.mts'
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
  eligibilityChildLimit = getRssFeedItemPageLimit('eligibility_child_limit'),
) {
  if (hasRelatedPosts === undefined) return
  const eligibility = currentUserId
    ? buildViewerPostDiscoveryEligibilityFilter('related_post', 'related_root_post', {
        currentUserId,
        isAdministrator,
      })
    : buildPublicPostEligibilityFilter('related_post', 'related_root_post')
  const cap = eligibilityChildLimit
  const relationRows = sql`(
    SELECT subject_id FROM "relation__post__related__url" rel_raw
    WHERE rel_raw.object_id = `.append(rssFeedItemUrlId).append(sql`
      AND rel_raw.deleted_at IS NULL
    ORDER BY rel_raw.subject_id DESC LIMIT ${cap + 1}
  )`)
  const linkRows = sql`(
    SELECT id FROM posts link_raw
    WHERE link_raw.url_id = `.append(rssFeedItemUrlId).append(sql`
      AND link_raw.post_type = 'link' AND link_raw.deleted_at IS NULL
    ORDER BY link_raw.id DESC LIMIT ${cap + 1}
  )`)
  query
    .append(sql`
    AND (SELECT COUNT(*) FROM `)
    .append(relationRows)
    .append(sql` related_raw) <= ${cap}
    AND (SELECT COUNT(*) FROM `)
    .append(linkRows)
    .append(sql` link_raw) <= ${cap}
    AND `)
    .append(hasRelatedPosts ? sql`(` : sql`NOT (`)
    .append(sql`EXISTS (
      SELECT 1 FROM `)
    .append(relationRows)
    .append(sql` related_raw
      JOIN "relation__post__related__url" rel ON rel.subject_id = related_raw.subject_id
        AND rel.object_id = `)
    .append(rssFeedItemUrlId)
    .append(sql`
      JOIN posts related_post ON related_post.id = rel.subject_id
      JOIN posts related_root_post ON related_root_post.id = COALESCE(related_post.root_post_id, related_post.id)
      WHERE rel.deleted_at IS NULL AND rel.votes_score_net > 0 AND `)
    .append(eligibility)
    .append(sql`
    ) OR EXISTS (
      SELECT 1 FROM `)
    .append(linkRows)
    .append(sql` link_raw
      JOIN posts related_post ON related_post.id = link_raw.id
      JOIN posts related_root_post ON related_root_post.id = COALESCE(related_post.root_post_id, related_post.id)
      WHERE `)
    .append(eligibility).append(sql`
    ))`)
}

export function getCutoffDateForTimeRange(
  timeRange: TimeRange,
  now = new Date(),
): {
  cutoffDate: Date | null
  itemCutoffId: string | null
} {
  const cutoffDate = getTimeRangeLowerBoundDate(timeRange, now)
  if (!cutoffDate) {
    return { cutoffDate: null, itemCutoffId: null }
  }

  return {
    cutoffDate,
    itemCutoffId: getMinUUIDv7ForDate(cutoffDate),
  }
}
