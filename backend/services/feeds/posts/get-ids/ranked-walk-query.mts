import sql, { type SQLStatement } from 'sql-template-strings'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { buildStablePostHotRankExpression } from '@services/posts/search/stable-hot-rank'
import { appendPostFeedRelationCTEs } from './relation-ctes.mts'
import { appendEligiblePostsSelect } from './eligible-posts-cte.mts'
import { buildDirectMatchCondition } from './direct-match.mts'
import { buildBroadcastVisibilityFilter } from './visibility-filter.mts'
import type { PostFeedPageQueryOptions } from './page-options.mts'

const BEFORE_FIRST_DELIVERY_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

/** Walk raw delivery keys in rank order; eligibility never expands the bounded input. */
export function buildRankedPostFeedPageQuery(
  options: PostFeedPageQueryOptions,
  inspectedRowCap: number,
): SQLStatement {
  const hot = options.eligibilityOptions.sort === 'hot'
  const score = hot ? buildStablePostHotRankExpression('posts') : sql`posts.votes_score_sort`
  const cursor = options.cursor
  const seedDeliveryId =
    cursor && cursor.sort !== 'new'
      ? sql`CASE WHEN first_post.id = ${cursor.postId}::uuid
          AND first_post.rank_score = ${cursor.score}::float8
          THEN ${cursor.id}::uuid ELSE ${BEFORE_FIRST_DELIVERY_ID}::uuid END`
      : sql`${BEFORE_FIRST_DELIVERY_ID}::uuid`
  const shareRecipient = options.includeSharedPosts
    ? sql`share.recipient_user_id = ${options.currentUserId}`
    : sql`FALSE`
  const query = sql`/* getPostFeedIds */ WITH RECURSIVE `
  appendPostFeedRelationCTEs(query, options)
  query
    .append(sql`, ranked_delivery_walk AS (
    SELECT first_post.rank_score, first_post.id AS post_id, `)
    .append(seedDeliveryId)
    .append(sql` AS result_id,
      'direct'::text AS delivery_type, NULL::uuid AS shared_by_id,
      NULL::timestamptz AS shared_at, NULL::timestamptz AS share_sort_at,
      0 AS inspected
    FROM (SELECT posts.id, `)
    .append(score).append(sql` AS rank_score FROM posts
      WHERE posts.deleted_at IS NULL AND posts.votes_score_net > 0`)
  if (cursor && cursor.sort !== 'new') {
    query
      .append(sql` AND (`)
      .append(score)
      .append(sql`, posts.id) <= (${cursor.score}::float8, ${cursor.postId}::uuid)`)
  }
  query
    .append(sql` ORDER BY `)
    .append(score)
    .append(sql` DESC, posts.id DESC LIMIT 1) first_post
    UNION ALL
    SELECT COALESCE(next_post.rank_score, walk.rank_score),
      COALESCE(next_post.id, walk.post_id),
      COALESCE(same_key.result_id, next_key.result_id),
      CASE WHEN same_key.result_id IS NOT NULL
        THEN CASE WHEN same_key.result_id = same_share.id THEN 'share' ELSE 'direct' END
        ELSE CASE WHEN next_key.result_id = next_share.id THEN 'share' ELSE 'direct' END
      END,
      CASE WHEN same_key.result_id IS NOT NULL
        THEN CASE WHEN same_key.result_id = same_share.id THEN same_share.shared_by_id END
        ELSE CASE WHEN next_key.result_id = next_share.id THEN next_share.shared_by_id END
      END,
      CASE WHEN same_key.result_id IS NOT NULL
        THEN CASE WHEN same_key.result_id = same_share.id THEN same_share.created_at END
        ELSE CASE WHEN next_key.result_id = next_share.id THEN next_share.created_at END
      END,
      CASE WHEN same_key.result_id IS NOT NULL
        THEN CASE WHEN same_key.result_id = same_share.id THEN same_share.sort_at END
        ELSE CASE WHEN next_key.result_id = next_share.id THEN next_share.sort_at END
      END,
      walk.inspected + 1
    FROM ranked_delivery_walk walk
    LEFT JOIN LATERAL (
      SELECT share.id, share.shared_by_id, share.created_at, share.sort_at
      FROM post_feed_shares share WHERE `)
    .append(shareRecipient)
    .append(sql`
        AND share.post_id = walk.post_id AND share.id < walk.result_id
      ORDER BY share.id DESC LIMIT 1
    ) same_share ON TRUE
    CROSS JOIN LATERAL (
      SELECT GREATEST(same_share.id,
        CASE WHEN walk.post_id < walk.result_id THEN walk.post_id END) AS result_id
    ) same_key
    LEFT JOIN LATERAL (
      SELECT posts.id, `)
    .append(score)
    .append(sql` AS rank_score FROM posts
      WHERE same_key.result_id IS NULL
        AND posts.deleted_at IS NULL AND posts.votes_score_net > 0
        AND (`)
    .append(score)
    .append(sql`, posts.id) < (walk.rank_score, walk.post_id)
      ORDER BY `)
    .append(score)
    .append(sql` DESC, posts.id DESC LIMIT 1
    ) next_post ON TRUE
    LEFT JOIN LATERAL (
      SELECT share.id, share.shared_by_id, share.created_at, share.sort_at
      FROM post_feed_shares share WHERE `)
    .append(shareRecipient)
    .append(sql`
        AND share.post_id = next_post.id
      ORDER BY share.id DESC LIMIT 1
    ) next_share ON TRUE
    CROSS JOIN LATERAL (
      SELECT GREATEST(next_share.id, next_post.id) AS result_id
    ) next_key
    WHERE walk.inspected < ${inspectedRowCap}
      AND COALESCE(same_key.result_id, next_key.result_id) IS NOT NULL
  ), inspected_tail AS (
    SELECT walk.result_id,
      walk.post_id, walk.rank_score,
      walk.inspected >= ${inspectedRowCap} AS inspected_has_more
    FROM ranked_delivery_walk walk ORDER BY walk.inspected DESC LIMIT 1
  )
  SELECT page.result_id, page.entity_id, page.post_type, page.delivery_type,
    page.shared_by_id, page.shared_at, `)
    .append(
      hot
        ? sql`page.rank_score AS hot_score, NULL::float8 AS best_score`
        : sql`NULL::float8 AS hot_score, page.rank_score AS best_score`,
    )
    .append(sql`, tail.inspected_has_more, tail.result_id AS inspected_result_id,
      tail.post_id AS inspected_entity_id, `)
    .append(
      hot
        ? sql`tail.rank_score AS inspected_hot_score, NULL::float8 AS inspected_best_score`
        : sql`NULL::float8 AS inspected_hot_score, tail.rank_score AS inspected_best_score`,
    ).append(sql`
  FROM inspected_tail tail
  LEFT JOIN LATERAL (
    SELECT walk.result_id, walk.post_id AS entity_id, eligible_posts.post_type,
      walk.rank_score, walk.delivery_type, walk.shared_by_id, walk.shared_at
    FROM ranked_delivery_walk walk CROSS JOIN LATERAL (`)
  appendEligiblePostsSelect(query, options.eligibilityOptions, sql`walk.post_id`)
  query
    .append(sql` LIMIT 1) eligible_posts
    WHERE walk.inspected > 0 AND `)
    .append(buildBroadcastVisibilityFilter('eligible_posts', options.currentUserId))
    .append(sql` AND ((walk.delivery_type = 'direct' AND `)
    .append(buildDirectMatchCondition(options))
  if (options.cutoff) query.append(sql` AND walk.post_id >= ${getMinUUIDv7ForDate(options.cutoff)}`)
  query.append(sql`) OR (walk.delivery_type = 'share'
    AND walk.shared_by_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM excluded_users WHERE excluded_users.user_id = walk.shared_by_id)`)
  if (options.cutoff) query.append(sql` AND walk.share_sort_at >= ${options.cutoff}`)
  query.append(sql`))
    ORDER BY walk.rank_score DESC, walk.post_id DESC, walk.result_id DESC
    LIMIT ${options.safeLimit + 1}
  ) page ON TRUE
  ORDER BY page.rank_score DESC, page.entity_id DESC, page.result_id DESC`)
  return query
}
