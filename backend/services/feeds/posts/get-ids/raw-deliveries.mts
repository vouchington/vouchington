import sql, { type SQLStatement } from 'sql-template-strings'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { postsWorkMaxValues } from '@services/posts/work-limits'
import { buildStablePostHotRankExpression } from '@services/posts/search/stable-hot-rank'
import type { PostFeedCursor } from './feed-cursor.mts'
import type { PostFeedPageQueryOptions } from './page-options.mts'

const CURSOR_TIME_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`

/** The numeric literal is checked before interpolation so generic plans cost the finite walk. */
function limitLiteral(limit: number): string {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > postsWorkMaxValues.post_feed_candidate_limit + 2
  )
    throw new Error('Invalid post feed candidate limit')
  return String(limit)
}

export function appendRawPostFeedCandidates(
  query: SQLStatement,
  options: PostFeedPageQueryOptions,
): void {
  if (options.eligibilityOptions.sort === 'new') appendNewCandidates(query, options)
  else appendRankedCandidates(query, options)
  appendBoundedCandidates(query, options.eligibilityOptions.sort, options.candidateLimit)
}

function appendNewCandidates(query: SQLStatement, options: PostFeedPageQueryOptions): void {
  const { candidateLimit, cursor, cutoff, currentUserId, includeSharedPosts } = options
  const upper = limitLiteral(candidateLimit + 1)
  query.append(sql`, raw_feed_candidates AS MATERIALIZED (
    SELECT source.result_id, source.post_id, source.sort_at, source.delivery_type,
      source.shared_by_id, source.shared_at
    FROM (
      (SELECT posts.id AS result_id, posts.id AS post_id, posts.created_at AS sort_at,
        'direct'::text AS delivery_type, NULL::uuid AS shared_by_id,
        NULL::timestamptz AS shared_at
       FROM posts WHERE posts.deleted_at IS NULL`)
  if (cutoff) query.append(sql` AND posts.id >= ${getMinUUIDv7ForDate(cutoff)}`)
  if (cursor?.sort === 'new')
    query.append(sql` AND posts.id < ${getMinUUIDv7ForDate(new Date(new Date(cursor.sortAt).getTime() + 1))}
      AND (posts.created_at, posts.id) < (${cursor.sortAt}::timestamptz, ${cursor.id}::uuid)`)
  query
    .append(sql` ORDER BY posts.id DESC LIMIT `)
    .append(upper)
    .append(sql`)`)
  if (includeSharedPosts) {
    query.append(sql`
      UNION ALL
      (SELECT shares.id AS result_id, shares.post_id, shares.sort_at,
        'share'::text AS delivery_type, shares.shared_by_id,
        shares.created_at AS shared_at
       FROM post_feed_shares shares
       WHERE shares.recipient_user_id = ${currentUserId}`)
    if (cutoff) query.append(sql` AND shares.sort_at >= ${cutoff}`)
    if (cursor?.sort === 'new')
      query.append(sql` AND (shares.sort_at, shares.id)
        < (${cursor.sortAt}::timestamptz, ${cursor.id}::uuid)`)
    query
      .append(sql` ORDER BY shares.sort_at DESC, shares.id DESC LIMIT `)
      .append(upper)
      .append(sql`)`)
  }
  query
    .append(sql`
    ) source ORDER BY source.sort_at DESC, source.result_id DESC LIMIT `)
    .append(upper).append(sql`
  )`)
}

function appendRankedCandidates(query: SQLStatement, options: PostFeedPageQueryOptions): void {
  const { candidateLimit, cursor, currentUserId, includeSharedPosts } = options
  const sort = options.eligibilityOptions.sort
  const rank = sort === 'hot' ? buildStablePostHotRankExpression() : sql`posts.votes_score_sort`
  // One ranked post can be exhausted by a same-post delivery cursor. The spare post
  // still gives the page a raw lookahead without counting or rescanning this CTE.
  const upper = limitLiteral(candidateLimit + (cursor ? 2 : 1))
  query
    .append(sql`, raw_ranked_posts AS (
    SELECT posts.id AS post_id, `)
    .append(rank).append(sql` AS delivery_rank
    FROM posts WHERE posts.deleted_at IS NULL AND posts.votes_score_net > 0`)
  if (cursor && cursor.sort !== 'new')
    query.append(sql` AND (`).append(rank).append(sql`, posts.id)
      <= (${cursor.rank}::float8, ${cursor.postId}::uuid)`)
  query
    .append(sql` ORDER BY `)
    .append(rank)
    .append(sql` DESC, posts.id DESC LIMIT `)
    .append(upper).append(sql`
  ), raw_feed_candidates AS MATERIALIZED (
    SELECT delivery.result_id, ranked.post_id, ranked.delivery_rank,
      delivery.delivery_type, delivery.shared_by_id, delivery.shared_at,
      delivery.share_sort_at
    FROM raw_ranked_posts ranked
    CROSS JOIN LATERAL (
      SELECT ranked.post_id AS result_id, 'direct'::text AS delivery_type,
        NULL::uuid AS shared_by_id, NULL::timestamptz AS shared_at,
        NULL::timestamptz AS share_sort_at
      WHERE TRUE`)
  appendRankedCursorFilter(query, cursor, sql`ranked.post_id`, sql`ranked.post_id`)
  if (includeSharedPosts) {
    query.append(sql`
      UNION ALL
      SELECT shares.id AS result_id, 'share'::text AS delivery_type,
        shares.shared_by_id, shares.created_at AS shared_at,
        shares.sort_at AS share_sort_at
      FROM (
        SELECT shares.id, shares.shared_by_id, shares.created_at, shares.sort_at
        FROM post_feed_shares shares
        WHERE shares.recipient_user_id = ${currentUserId}
          AND shares.post_id = ranked.post_id`)
    if (cursor && cursor.sort !== 'new')
      // The tuple predicate below is exact; this outer-key-dependent id bound lets the
      // recipient/post/id index skip older shares of the cursor's post before LIMIT.
      query.append(sql` AND shares.id <= CASE
        WHEN (ranked.delivery_rank, ranked.post_id) =
          (${cursor.rank}::float8, ${cursor.postId}::uuid)
        THEN ${cursor.id}::uuid
        ELSE 'ffffffff-ffff-7fff-bfff-ffffffffffff'::uuid
      END`)
    appendRankedCursorFilter(query, cursor, sql`ranked.post_id`, sql`shares.id`)
    query.append(sql` ORDER BY shares.id DESC LIMIT `).append(upper).append(sql`
      ) shares`)
  }
  query
    .append(sql`
      ORDER BY result_id DESC LIMIT `)
    .append(upper)
    .append(sql`
    ) delivery
    ORDER BY ranked.delivery_rank DESC, ranked.post_id DESC,
      delivery.result_id DESC LIMIT `)
    .append(upper).append(sql`
  )`)
}

function appendRankedCursorFilter(
  query: SQLStatement,
  cursor: PostFeedCursor | null,
  postId: SQLStatement,
  resultId: SQLStatement,
): void {
  if (!cursor || cursor.sort === 'new') return
  query
    .append(sql` AND (ranked.delivery_rank, `)
    .append(postId)
    .append(sql`, `)
    .append(resultId)
    .append(sql`) < (${cursor.rank}::float8, ${cursor.postId}::uuid, ${cursor.id}::uuid)`)
}

function appendBoundedCandidates(
  query: SQLStatement,
  sort: 'new' | 'hot' | 'best',
  candidateLimit: number,
): void {
  const rankOrder =
    sort === 'new'
      ? sql`sort_at DESC, result_id DESC`
      : sql`delivery_rank DESC, post_id DESC, result_id DESC`
  const reverseOrder =
    sort === 'new'
      ? sql`sort_at ASC, result_id ASC`
      : sql`delivery_rank ASC, post_id ASC, result_id ASC`
  query
    .append(sql`, bounded_feed_candidates AS MATERIALIZED (
    SELECT * FROM raw_feed_candidates ORDER BY `)
    .append(rankOrder)
    .append(sql` LIMIT `)
    .append(limitLiteral(candidateLimit)).append(sql`
  ), feed_candidate_boundary AS (
    SELECT result_id AS inspected_id, `)
  if (sort === 'new')
    query.append(sql`to_char(sort_at AT TIME ZONE 'UTC', `).append(CURSOR_TIME_FORMAT)
      .append(sql`) AS inspected_sort_at, NULL::float8 AS inspected_rank,
        NULL::uuid AS inspected_post_id`)
  else
    query.append(sql`NULL::text AS inspected_sort_at, delivery_rank AS inspected_rank,
      post_id AS inspected_post_id`)
  query.append(sql` FROM bounded_feed_candidates ORDER BY `).append(reverseOrder)
    .append(sql` LIMIT 1
  )`)
}
