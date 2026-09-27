import sql, { type SQLStatement } from 'sql-template-strings'
import { getTimeRangeLowerBoundDate } from '../../time-range-utils.mts'
import type { PostFeedOptions } from '../../types.mts'
import { appendTimestampCursorFilter } from './cursor-filter.mts'
import type { PostFeedCursor } from './feed-cursor.mts'
import { buildBroadcastVisibilityFilter } from './visibility-filter.mts'
import {
  appendEligiblePostsSelect,
  type PostFeedEligibilityOptions,
} from './eligible-posts-cte.mts'

export function appendSharedPosts(
  query: SQLStatement,
  {
    currentUserId,
    cursor,
    eligibilityOptions,
    sort,
    timeRange,
  }: {
    currentUserId: string
    cursor: PostFeedCursor
    eligibilityOptions: PostFeedEligibilityOptions
    sort: string
    timeRange: PostFeedOptions['time_range']
  },
): void {
  const sharedPostsCutoffDate = getTimeRangeLowerBoundDate(timeRange ?? '1w')
  query.append(sql`
    ),
    shared_post_candidates AS MATERIALIZED (
      SELECT post_feed_shares.id, post_feed_shares.post_id,
        post_feed_shares.sort_at, post_feed_shares.shared_by_user_id, post_feed_shares.created_at
      FROM post_feed_shares
      WHERE post_feed_shares.recipient_user_id = ${currentUserId}
        AND post_feed_shares.shared_by_user_id NOT IN (
          SELECT user_id FROM excluded_users
        )`)
  if (sharedPostsCutoffDate) {
    query.append(sql`
        AND post_feed_shares.sort_at >= ${sharedPostsCutoffDate}`)
  }
  if (sort !== 'hot') {
    appendTimestampCursorFilter(query, {
      cursor,
      idColumn: sql`post_feed_shares.id`,
      sortAtColumn: sql`post_feed_shares.sort_at`,
    })
  }
  query.append(sql`
    ),
    shared_post_targets AS MATERIALIZED (
      SELECT DISTINCT post_id FROM shared_post_candidates
    ),
    eligible_shared_posts AS MATERIALIZED (
      SELECT eligible_target.*
      FROM shared_post_targets
      CROSS JOIN LATERAL (`)
  appendEligiblePostsSelect(query, eligibilityOptions, sql`shared_post_targets.post_id`)
  query.append(sql`
        LIMIT 1
      ) eligible_target
    ),
    shared_posts AS (
      SELECT shared_post_candidates.id AS result_id, eligible_shared_posts.id AS entity_id,
        eligible_shared_posts.post_type, shared_post_candidates.sort_at,
        'share'::text AS delivery_type, shared_post_candidates.shared_by_user_id,
        shared_post_candidates.created_at AS shared_at`)
  if (sort === 'hot') query.append(sql`,\n        eligible_shared_posts.hot_score`)
  query.append(sql`
      FROM shared_post_candidates
      JOIN eligible_shared_posts ON eligible_shared_posts.id = shared_post_candidates.post_id
      WHERE `)
  query.append(buildBroadcastVisibilityFilter('eligible_shared_posts', currentUserId))
}
