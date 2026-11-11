import sql, { type SQLStatement } from 'sql-template-strings'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { buildStablePostHotRankExpression } from '@services/posts/search/stable-hot-rank'
import { appendPostFeedRelationCTEs } from './relation-ctes.mts'
import { appendEligiblePostsSelect } from './eligible-posts-cte.mts'
import { buildDirectMatchCondition } from './direct-match.mts'
import { buildBroadcastVisibilityFilter } from './visibility-filter.mts'
import type { PostFeedPageQueryOptions } from './page-options.mts'

// An inspected post's deliveries have all been visited when its cursor reaches this key.
export const EXHAUSTED_POST_DELIVERY_ID = '00000000-0000-7000-8000-000000000000'

/** One ranked post index walk, followed by keyed eligibility and recipient-delivery probes. */
export function buildRankedPostFeedPageQuery(
  options: PostFeedPageQueryOptions,
  inspectedRowCap: number,
): SQLStatement {
  const hot = options.eligibilityOptions.sort === 'hot'
  const score = hot ? buildStablePostHotRankExpression('posts') : sql`posts.votes_score_sort`
  const cursor = options.cursor
  const query = sql`/* getPostFeedIds */ WITH `
  appendPostFeedRelationCTEs(query, options)
  query
    .append(sql`, inspected_posts AS MATERIALIZED (
    SELECT posts.id, `)
    .append(score).append(sql` AS rank_score
    FROM posts WHERE posts.deleted_at IS NULL AND posts.votes_score_net > 0`)
  if (cursor && cursor.sort !== 'new') {
    query
      .append(sql` AND (`)
      .append(score)
      .append(sql`, posts.id) `)
      .append(cursor.id === EXHAUSTED_POST_DELIVERY_ID ? '<' : '<=')
      .append(sql` (${cursor.score}::float8, ${cursor.postId}::uuid)`)
  }
  query
    .append(sql` ORDER BY `)
    .append(score)
    .append(sql` DESC, posts.id DESC
    LIMIT ${inspectedRowCap}
  ), inspected_tail AS (
    SELECT inspected_posts.id, inspected_posts.rank_score, count(*) OVER () AS inspected_rows
    FROM inspected_posts ORDER BY rank_score ASC, id ASC LIMIT 1
  )
  SELECT page.result_id, page.entity_id, page.post_type, page.delivery_type,
    page.shared_by_id, page.shared_at, `)
    .append(
      hot
        ? sql`page.rank_score AS hot_score, NULL::float8 AS best_score`
        : sql`NULL::float8 AS hot_score, page.rank_score AS best_score`,
    )
    .append(sql`, tail.inspected_rows, ${EXHAUSTED_POST_DELIVERY_ID}::uuid AS inspected_result_id,
      tail.id AS inspected_entity_id, `)
    .append(
      hot
        ? sql`tail.rank_score AS inspected_hot_score, NULL::float8 AS inspected_best_score`
        : sql`NULL::float8 AS inspected_hot_score, tail.rank_score AS inspected_best_score`,
    ).append(sql`
  FROM inspected_tail tail
  LEFT JOIN LATERAL (
    SELECT delivery.result_id, walk.id AS entity_id, eligible_posts.post_type, walk.rank_score,
      delivery.delivery_type, delivery.shared_by_id, delivery.shared_at
    FROM inspected_posts walk CROSS JOIN LATERAL (`)
  appendEligiblePostsSelect(query, options.eligibilityOptions, sql`walk.id`)
  query
    .append(sql` LIMIT 1) eligible_posts
    CROSS JOIN LATERAL (
      SELECT walk.id AS result_id, 'direct'::text AS delivery_type,
        NULL::uuid AS shared_by_id, NULL::timestamptz AS shared_at WHERE `)
    .append(buildDirectMatchCondition(options))
  if (options.cutoff) query.append(sql` AND walk.id >= ${getMinUUIDv7ForDate(options.cutoff)}`)
  if (options.includeSharedPosts) {
    query.append(sql` UNION ALL
      SELECT share.id, 'share'::text, share.shared_by_id, share.created_at
      FROM post_feed_shares share WHERE share.post_id = walk.id
        AND share.recipient_user_id = ${options.currentUserId} AND share.shared_by_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM excluded_users WHERE excluded_users.user_id = share.shared_by_id)`)
    if (options.cutoff) query.append(sql` AND share.sort_at >= ${options.cutoff}`)
  }
  query
    .append(sql`) delivery WHERE `)
    .append(buildBroadcastVisibilityFilter('eligible_posts', options.currentUserId))
  if (cursor && cursor.sort !== 'new')
    query.append(sql` AND (walk.rank_score, walk.id, delivery.result_id)
      < (${cursor.score}::float8, ${cursor.postId}::uuid, ${cursor.id}::uuid)`)
  query.append(sql` ORDER BY walk.rank_score DESC, walk.id DESC, delivery.result_id DESC
    LIMIT ${options.safeLimit + 1}
  ) page ON TRUE
  ORDER BY page.rank_score DESC, page.entity_id DESC, page.result_id DESC`)
  return query
}
