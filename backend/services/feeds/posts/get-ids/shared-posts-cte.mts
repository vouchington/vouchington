import sql, { type SQLStatement } from 'sql-template-strings'
import { getTimeRangeLowerBoundDate } from '../../time-range-utils.mts'
import type { PostFeedOptions } from '../../types.mts'
import { appendTimestampCursorFilter } from './cursor-filter.mts'
import type { PostFeedCursor } from './feed-cursor.mts'
import { buildBroadcastVisibilityFilter } from './visibility-filter.mts'

export function appendSharedPosts(
  query: SQLStatement,
  {
    currentUserId,
    cursor,
    includeSharedPosts,
    sort,
    timeRange,
  }: {
    currentUserId: string
    cursor: PostFeedCursor
    includeSharedPosts: boolean
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
        AND ${includeSharedPosts}
        AND NOT EXISTS (
          SELECT 1 FROM excluded_users WHERE excluded_users.user_id = post_feed_shares.shared_by_user_id
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
    shared_posts AS (
      SELECT shared_post_candidates.id AS result_id, eligible_posts.id AS entity_id,
        eligible_posts.post_type, shared_post_candidates.sort_at,
        'share'::text AS delivery_type, shared_post_candidates.shared_by_user_id,
        shared_post_candidates.created_at AS shared_at`)
  if (sort === 'hot') query.append(sql`,\n        eligible_posts.hot_score`)
  query.append(sql`
      FROM shared_post_candidates
      JOIN eligible_posts ON eligible_posts.id = shared_post_candidates.post_id
      WHERE `)
  query.append(buildBroadcastVisibilityFilter('eligible_posts', currentUserId))
}
