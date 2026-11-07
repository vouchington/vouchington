import sql, { type SQLStatement } from 'sql-template-strings'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { buildDirectMatchCondition } from './direct-match.mts'
import type { PostFeedPageQueryOptions } from './page-query.mts'
import { buildBroadcastVisibilityFilter } from './visibility-filter.mts'

/**
 * Best walks posts by score (`idx_posts__votes_score_sort__positive__id`). A post emits its
 * direct delivery and the viewer's shares of it, ordered within the post by delivery id.
 */
export function appendBestWalk(
  query: SQLStatement,
  { cursor, cutoff, currentUserId, safeLimit, ...options }: PostFeedPageQueryOptions,
): void {
  query
    .append(sql`
    SELECT delivery.result_id, eligible_posts.id AS entity_id, eligible_posts.post_type,
      delivery.delivery_type, delivery.shared_by_id, delivery.shared_at,
      eligible_posts.votes_score_sort AS best_score
    FROM eligible_posts
    CROSS JOIN LATERAL (
      SELECT eligible_posts.id AS result_id, 'direct'::text AS delivery_type,
        NULL::uuid AS shared_by_id, NULL::timestamptz AS shared_at
      WHERE `)
    .append(buildDirectMatchCondition(options))
  if (cutoff)
    query.append(sql`
        AND eligible_posts.id >= ${getMinUUIDv7ForDate(cutoff)}`)
  if (options.includeSharedPosts) {
    query.append(sql`
      UNION ALL
      SELECT post_feed_shares.id, 'share'::text, post_feed_shares.shared_by_id,
        post_feed_shares.created_at
      FROM post_feed_shares
      WHERE post_feed_shares.recipient_user_id = ${currentUserId}
        AND post_feed_shares.post_id = eligible_posts.id
        AND post_feed_shares.shared_by_id IS NOT NULL
        AND (NOT EXISTS (
          SELECT 1 FROM excluded_users
          WHERE excluded_users.user_id = post_feed_shares.shared_by_id
        )) IS TRUE`)
    if (cutoff)
      query.append(sql`
        AND post_feed_shares.sort_at >= ${cutoff}`)
  }
  query
    .append(sql`
    ) delivery
    WHERE `)
    .append(buildBroadcastVisibilityFilter('eligible_posts', currentUserId))
  if (cursor?.sort === 'best')
    query.append(sql`
      AND (eligible_posts.votes_score_sort, eligible_posts.id)
        <= (${cursor.score}::float8, ${cursor.postId}::uuid)
      AND (eligible_posts.votes_score_sort, eligible_posts.id, delivery.result_id)
        < (${cursor.score}::float8, ${cursor.postId}::uuid, ${cursor.id}::uuid)`)
  query.append(sql`
    ORDER BY eligible_posts.votes_score_sort DESC, eligible_posts.id DESC, delivery.result_id DESC
    LIMIT ${safeLimit + 1}`)
}
