import createHttpError from 'http-errors'
import type { BasicUser } from '@services/users/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions, PostSearchSort } from '../types.mts'

type BuildPostSearchQuery = (
  currentUser: BasicUser | undefined,
  options: PostSearchOptions,
) => SQLStatement

const NIL_POST_ID = '00000000-0000-0000-0000-000000000000'
// These three types are the predicate of idx_posts__post_type__id and its votes sibling.
const PARTIAL_POST_TYPE_INDEX = new Set(['story', 'data_point', 'topic_recommendation'])

/** Followed posts, then everyone else, each walking id order. A full followed page skips the rest. */
export function buildFollowingNewPage(
  currentUser: BasicUser,
  options: PostSearchOptions,
  buildQuery: BuildPostSearchQuery,
): SQLStatement {
  if ((options.ranking_lt === undefined) !== (options.id_lt === undefined))
    throw createHttpError(500, 'following_new cursor requires ranking_lt and id_lt')
  const followedIdLt = options.ranking_lt === 0 ? NIL_POST_ID : options.id_lt
  const otherIdLt = options.ranking_lt === 0 ? options.id_lt : undefined
  const limit = options.limit ?? 100
  const followed = buildQuery(currentUser, {
    ...options,
    sort: 'new',
    following_phase: 'followed',
    ranking_lt: undefined,
    vote_score_lt: undefined,
    id_lt: followedIdLt,
    limit,
  })
  const other = buildQuery(currentUser, {
    ...options,
    sort: 'new',
    following_phase: 'other',
    ranking_lt: undefined,
    vote_score_lt: undefined,
    id_lt: otherIdLt,
    limit,
  })
  return sql`/* buildPostSearchQuery */
  WITH followed_page AS (`
    .append(followed)
    .append(sql`)
  SELECT * FROM followed_page
  UNION ALL
  (`)
    .append(other).append(sql`)
  ORDER BY following_rank DESC, id DESC
  LIMIT ${limit}`)
}

export function appendFollowingPhaseFilters(
  filters: SQLStatement[],
  userId: string,
  phase: 'followed' | 'other',
  limit: number,
): void {
  const followedAuthor = sql`EXISTS (
    SELECT 1
    FROM LATERAL (
      SELECT 1
      FROM relation__user__follow__user viewer_following
      WHERE viewer_following.subject_id = ${userId}
        AND viewer_following.object_id = posts.created_by_id
        AND viewer_following.deleted_at IS NULL
      LIMIT 1
    ) viewer_follow)`
  filters.push(phase === 'followed' ? followedAuthor : sql`NOT `.append(followedAuthor))
  if (phase === 'other') filters.push(sql`(SELECT count(*) FROM followed_page) < ${limit}`)
}

/**
 * A mixed type list cannot use the partial post-type index in one scan.
 * Each arm walks that sort key and stops at the page, then the union keeps the page.
 */
export function buildMixedPartialPostTypePage(
  currentUser: BasicUser | undefined,
  options: PostSearchOptions,
  sort: PostSearchSort,
  buildQuery: BuildPostSearchQuery,
): SQLStatement | null {
  if (sort !== 'new' && sort !== 'best') return null
  if (options.community_id !== undefined || options.following_phase) return null
  const postTypes = options.post_types
  if (!postTypes || postTypes.length < 2) return null
  const covered = postTypes.filter(postType => PARTIAL_POST_TYPE_INDEX.has(postType))
  const other = postTypes.filter(postType => !PARTIAL_POST_TYPE_INDEX.has(postType))
  if (covered.length === 0 || other.length === 0) return null
  const coveredPage = buildQuery(currentUser, { ...options, post_types: covered })
  const otherPage = buildQuery(currentUser, { ...options, post_types: other })
  const limit = options.limit ?? 100
  const order =
    sort === 'best'
      ? sql` ORDER BY vote_score DESC, id DESC LIMIT ${limit}`
      : sql` ORDER BY id DESC LIMIT ${limit}`
  return sql`/* buildPostSearchQuery */ SELECT * FROM ((`
    .append(coveredPage)
    .append(sql`) UNION ALL (`)
    .append(otherPage)
    .append(sql`)) mixed_post_types`)
    .append(order)
}
