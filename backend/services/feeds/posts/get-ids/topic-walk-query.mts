import sql, { type SQLStatement } from 'sql-template-strings'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { buildHotScoreExpression } from '@modules/feed-query-builders/hot-score'
import { appendPostFeedRelationCTEs } from './relation-ctes.mts'
import { appendEligiblePostsSelect } from './eligible-posts-cte.mts'
import { buildDirectMatchCondition } from './direct-match.mts'
import { buildBroadcastVisibilityFilter } from './visibility-filter.mts'
import type { PostFeedPageQueryOptions } from './page-options.mts'

const CURSOR_TIME_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`

/** Inspect sort keys first; membership and viewer eligibility probe only those delivery rows. */
export function buildTopicPostFeedPageQuery(
  options: PostFeedPageQueryOptions,
  inspectedRowCap: number,
): SQLStatement {
  const query = sql`/* getPostFeedIds */ WITH `
  appendPostFeedRelationCTEs(query, options)
  // Both the result page and continuation tail consume this same independently bounded walk.
  query.append(sql`, inspected_deliveries AS MATERIALIZED (`)
  appendDeliveryKeys(query, options, inspectedRowCap)
  query
    .append(sql`), inspected_tail AS (
    SELECT inspected_deliveries.result_id, inspected_deliveries.entity_id,
      inspected_deliveries.sort_at, inspected_deliveries.hot_score, inspected_deliveries.best_score,
      count(*) OVER () AS inspected_rows
    FROM inspected_deliveries
    ORDER BY `)
    .append(orderBy(options, 'inspected_deliveries', true))
    .append(sql` LIMIT 1
  )
  SELECT page.result_id, page.entity_id, page.post_type, page.delivery_type,
    page.shared_by_id, page.shared_at, page.hot_score, page.best_score, page.cursor_sort_at,
    tail.inspected_rows,
    tail.result_id AS inspected_result_id, tail.entity_id AS inspected_entity_id,
    tail.hot_score AS inspected_hot_score, tail.best_score AS inspected_best_score,
    to_char(tail.sort_at AT TIME ZONE 'UTC', `)
    .append(CURSOR_TIME_FORMAT)
    .append(sql`)
      AS inspected_sort_at
  FROM inspected_tail tail
  LEFT JOIN LATERAL (
    SELECT walk.result_id, walk.entity_id, walk.sort_at, eligible_posts.post_type,
      walk.delivery_type, walk.shared_by_id, walk.shared_at, walk.hot_score, walk.best_score,
      to_char(walk.sort_at AT TIME ZONE 'UTC', `)
    .append(CURSOR_TIME_FORMAT).append(sql`)
        AS cursor_sort_at
    FROM inspected_deliveries walk
    CROSS JOIN LATERAL (`)
  appendEligiblePostsSelect(query, options.eligibilityOptions, sql`walk.entity_id`)
  query
    .append(sql` LIMIT 1) eligible_posts
    WHERE `)
    .append(buildBroadcastVisibilityFilter('eligible_posts', options.currentUserId))
    .append(sql` AND (
      (walk.delivery_type = 'direct' AND `)
    .append(buildDirectMatchCondition(options))
    .append(sql`) OR (walk.delivery_type = 'share' AND NOT EXISTS (
      SELECT 1 FROM excluded_users WHERE excluded_users.user_id = walk.shared_by_id
    )))
    ORDER BY `)
    .append(orderBy(options, 'walk'))
    .append(sql`
    LIMIT ${options.safeLimit + 1}
  ) page ON TRUE
  ORDER BY `)
    .append(orderBy(options, 'page'))
  return query
}

function orderBy(options: PostFeedPageQueryOptions, alias: string, reverse = false): string {
  const direction = reverse ? 'ASC' : 'DESC'
  const sort = options.eligibilityOptions.sort
  if (sort === 'best')
    return `${alias}.best_score ${direction}, ${alias}.entity_id ${direction}, ${alias}.result_id ${direction}`
  return `${alias}.${sort === 'hot' ? 'hot_score' : 'sort_at'} ${direction}, ${alias}.result_id ${direction}`
}

function appendDeliveryKeys(
  query: SQLStatement,
  options: PostFeedPageQueryOptions,
  cap: number,
): void {
  if (options.eligibilityOptions.sort === 'best') {
    appendBestDeliveryKeys(query, options, cap)
    return
  }
  query.append(sql`SELECT delivery.result_id, delivery.entity_id, delivery.sort_at, delivery.hot_score,
    delivery.best_score, delivery.delivery_type, delivery.shared_by_id, delivery.shared_at FROM (`)
  appendNewOrHotArm(query, options, cap, false)
  if (options.includeSharedPosts) {
    query.append(sql` UNION ALL `)
    appendNewOrHotArm(query, options, cap, true)
  }
  query
    .append(sql`) delivery ORDER BY `)
    .append(orderBy(options, 'delivery'))
    .append(sql` LIMIT ${cap}`)
}

function appendNewOrHotArm(
  query: SQLStatement,
  options: PostFeedPageQueryOptions,
  cap: number,
  shares: boolean,
): void {
  const hot = options.eligibilityOptions.sort === 'hot'
  const resultId = shares ? 'post_feed_shares.id' : 'posts.id'
  const sortAt = shares ? 'post_feed_shares.sort_at' : 'posts.created_at'
  const score = hot
    ? buildHotScoreExpression('posts', options.eligibilityOptions.scoreReferenceDate)
    : sql`NULL::float8`
  query
    .append(sql`(SELECT `)
    .append(resultId)
    .append(sql` AS result_id,
    posts.id AS entity_id, `)
    .append(sortAt)
    .append(sql` AS sort_at, `)
    .append(score)
    .append(sql` AS hot_score, NULL::float8 AS best_score, `)
    .append(
      shares
        ? sql`'share'::text AS delivery_type, post_feed_shares.shared_by_id,
          post_feed_shares.created_at AS shared_at
        FROM post_feed_shares JOIN posts ON posts.id = post_feed_shares.post_id
        WHERE post_feed_shares.recipient_user_id = ${options.currentUserId}
          AND post_feed_shares.shared_by_id IS NOT NULL AND posts.deleted_at IS NULL`
        : sql`'direct'::text AS delivery_type, NULL::uuid AS shared_by_id,
          NULL::timestamptz AS shared_at FROM posts WHERE posts.deleted_at IS NULL`,
    )
  if (hot) query.append(sql` AND posts.votes_score_net > 0`)
  if (options.cutoff)
    query
      .append(sql` AND `)
      .append(
        shares
          ? sql`post_feed_shares.sort_at >= ${options.cutoff}`
          : sql`posts.id >= ${getMinUUIDv7ForDate(options.cutoff)}`,
      )
  const cursor = options.cursor
  if (cursor?.sort === 'new') {
    if (!shares)
      query.append(
        sql` AND posts.id < ${getMinUUIDv7ForDate(new Date(new Date(cursor.sortAt).getTime() + 1))}::uuid`,
      )
    query
      .append(sql` AND (`)
      .append(sortAt)
      .append(sql`, `)
      .append(resultId)
      .append(sql`) < (${cursor.sortAt}::timestamptz, ${cursor.id}::uuid)`)
  } else if (cursor?.sort === 'hot')
    query
      .append(sql` AND (`)
      .append(score)
      .append(sql`, `)
      .append(resultId)
      .append(sql`) < (${cursor.score}::float8, ${cursor.id}::uuid)`)
  // UUIDv7 already orders direct deliveries by their derived creation timestamp. Naming that
  // timestamp here makes PostgreSQL sort the entire time window before it can apply the cap.
  query.append(sql` ORDER BY `)
  if (hot)
    query
      .append(sql`hot_score DESC, `)
      .append(resultId)
      .append(sql` DESC`)
  else if (shares) query.append(sql`post_feed_shares.sort_at DESC, post_feed_shares.id DESC`)
  else query.append(sql`posts.id DESC`)
  query.append(sql` LIMIT ${cap})`)
}

function appendBestDeliveryKeys(
  query: SQLStatement,
  options: PostFeedPageQueryOptions,
  cap: number,
): void {
  query.append(sql`SELECT delivery.result_id, posts.id AS entity_id, posts.created_at AS sort_at,
    NULL::float8 AS hot_score, posts.votes_score_sort AS best_score,
    delivery.delivery_type, delivery.shared_by_id, delivery.shared_at
    FROM posts CROSS JOIN LATERAL (
      SELECT posts.id AS result_id, 'direct'::text AS delivery_type,
        NULL::uuid AS shared_by_id, NULL::timestamptz AS shared_at WHERE TRUE`)
  if (options.cutoff) query.append(sql` AND posts.id >= ${getMinUUIDv7ForDate(options.cutoff)}`)
  if (options.includeSharedPosts) {
    query.append(sql` UNION ALL SELECT share.id, 'share'::text, share.shared_by_id, share.created_at
      FROM post_feed_shares share WHERE share.post_id = posts.id
        AND share.recipient_user_id = ${options.currentUserId} AND share.shared_by_id IS NOT NULL`)
    if (options.cutoff) query.append(sql` AND share.sort_at >= ${options.cutoff}`)
  }
  query.append(sql`) delivery WHERE posts.votes_score_net > 0 AND posts.deleted_at IS NULL`)
  if (options.cursor?.sort === 'best') {
    const cursor = options.cursor
    query.append(sql` AND (posts.votes_score_sort, posts.id) <= (${cursor.score}::float8, ${cursor.postId}::uuid)
      AND (posts.votes_score_sort, posts.id, delivery.result_id)
        < (${cursor.score}::float8, ${cursor.postId}::uuid, ${cursor.id}::uuid)`)
  }
  query.append(
    sql` ORDER BY posts.votes_score_sort DESC, posts.id DESC, delivery.result_id DESC LIMIT ${cap}`,
  )
}
