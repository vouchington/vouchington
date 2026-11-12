import type { PrivateUser } from '@services/users/types'
import type { PostSearchOptions } from './types.mts'
import { buildPostSearchQuery } from './query-builder.mts'
import { executePostSearchQuery } from './execute-query.mts'
import { getCachedSearchEmbedding } from '@services/embeddings/search/get-cached'
import { buildCountQuery, hasSemanticSearch } from '@modules/search-utils'
import { read } from '@data-stores/psql'
import {
  getProfileCountCap,
  profileCountProbeLimit,
  toCappedCount,
  type CappedCount,
} from '@services/users/profile-count-cap'
import sql, { type SQLStatement } from 'sql-template-strings'

type PostSearchFacets = {
  total_count: number
}

export async function getPostFacets(
  currentUser?: PrivateUser,
  options: PostSearchOptions = {},
): Promise<PostSearchFacets> {
  // Compute embedding for semantic search before building query
  let semanticSearchEmbedding: number[] | undefined
  if (hasSemanticSearch(options)) {
    semanticSearchEmbedding = await getCachedSearchEmbedding(options.semantic_search_query!)
  }

  // Build the base query, ignoring pagination cursors
  const baseQuery = buildPostSearchQuery(currentUser, {
    ...options,
    // Strip pagination cursors
    after: undefined,
    id_lt: undefined,
    vote_score_lt: undefined,
    ranking_lt: undefined,
    // Skip LIMIT and ORDER BY for count queries
    omitLimit: true,
    omitOrderBy: true,
    semanticSearchEmbedding,
  })

  // Wrap in COUNT query
  const countQuery = buildCountQuery(baseQuery)

  const { rows } = await executePostSearchQuery<{ total_count: string }>(
    countQuery,
    semanticSearchEmbedding !== undefined,
  )

  return {
    total_count: Number.parseInt(rows[0]?.total_count || '0', 10),
  }
}

export type UserPostTypeFacets = Record<'review' | 'discussion' | 'comment', CappedCount>

/** Reads at most cap + 1 rows, unordered: only their number matters, never which rows they are. */
function profileCountOptions(
  userId: string,
  postType: 'review' | 'discussion' | 'comment',
  cap: number,
): PostSearchOptions {
  return {
    user_id: userId,
    profileCountPostType: postType,
    limit: profileCountProbeLimit(cap),
    omitOrderBy: true,
  }
}

/** Review count. The type literal is fixed in this statement so its partial index can be proved. */
function buildReviewProfileCount(
  userId: string,
  currentUser: PrivateUser | undefined,
  cap: number,
): SQLStatement {
  const query = sql`/* getUserPostTypeFacetsReview */
    -- cross-partition: a profile total counts this author's reviews across id ranges
    SELECT COUNT(*)::int AS review_count FROM (`
  query.append(buildPostSearchQuery(currentUser, profileCountOptions(userId, 'review', cap)))
  query.append(sql`) AS review_posts`)
  return query
}

/** Discussion count. The type literal is fixed in this statement so its partial index can be proved. */
function buildDiscussionProfileCount(
  userId: string,
  currentUser: PrivateUser | undefined,
  cap: number,
): SQLStatement {
  const query = sql`/* getUserPostTypeFacetsDiscussion */
    -- cross-partition: a profile total counts this author's discussions across id ranges
    SELECT COUNT(*)::int AS discussion_count FROM (`
  query.append(buildPostSearchQuery(currentUser, profileCountOptions(userId, 'discussion', cap)))
  query.append(sql`) AS discussion_posts`)
  return query
}

/** Comment count. The type literal is fixed in this statement so its partial index can be proved. */
function buildCommentProfileCount(
  userId: string,
  currentUser: PrivateUser | undefined,
  cap: number,
): SQLStatement {
  const query = sql`/* getUserPostTypeFacetsComment */
    -- cross-partition: a profile total counts this author's comments across id ranges
    SELECT COUNT(*)::int AS comment_count FROM (`
  query.append(buildPostSearchQuery(currentUser, profileCountOptions(userId, 'comment', cap)))
  query.append(sql`) AS comment_posts`)
  return query
}

function countFrom(rows: readonly Record<string, unknown>[], column: string): number {
  const value = rows[0]?.[column]
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : 0
}

/** Each type has its own author-index scan; read() preserves an active primary-read scope. */
async function readProfileCount(
  statement: SQLStatement,
  column: string,
  cap: number,
): Promise<CappedCount> {
  const { rows } = await read(statement)
  return toCappedCount(countFrom(rows, column), cap)
}

export async function getUserPostTypeFacets(
  userId: string,
  currentUser?: PrivateUser,
): Promise<UserPostTypeFacets> {
  // The three types fix the fanout at three pooled reads, regardless of the author's post count.
  const cap = getProfileCountCap()
  const [review, discussion, comment] = await Promise.all([
    readProfileCount(buildReviewProfileCount(userId, currentUser, cap), 'review_count', cap),
    readProfileCount(
      buildDiscussionProfileCount(userId, currentUser, cap),
      'discussion_count',
      cap,
    ),
    readProfileCount(buildCommentProfileCount(userId, currentUser, cap), 'comment_count', cap),
  ])
  return { review, discussion, comment }
}
