import type { BasicUser } from '@services/users/types'
import { hasSemanticSearch as hasSemanticSearchFilter } from '@modules/search-utils'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions, PostSearchSort } from '../types.mts'
import { buildPostRankingScoreExpression } from '../query-builder-utils.mts'
import { appendCtes, buildPostSearchCtes } from './ctes.mts'
import { appendPostSearchOrderAndLimit } from './order-and-limit.mts'
import { appendPostSearchSelectAndJoins } from './select-and-joins.mts'
import { appendPostSearchWhereClause } from './where-clause.mts'
import { buildRawCandidates, candidateCap } from './bounded-candidate-raw.mts'
import { candidateLimitLiteral } from './bounded-candidate-indexes.mts'
import { candidateOrder, candidateReverseOrder } from './bounded-candidate-cursor.mts'
import { indexServedDataPointTopicId, usesTopicBestCohort } from '../topic-best-cohort.mts'

/** Every non-semantic list inspects a finite index-ordered raw prefix. */
export function usesBoundedPostSearchCandidates(
  options: PostSearchOptions,
  sort: PostSearchSort,
): boolean {
  if (options.omitLimit || options.omitOrderBy) return false
  // A resolved semantic search already has a finite nearest-vector candidate window.
  if (hasSemanticSearchFilter(options) && options.semanticSearchEmbedding !== undefined)
    return false
  return (
    sort === 'new' ||
    sort === 'best' ||
    sort === 'hot' ||
    sort === 'trending' ||
    sort === 'relevance' ||
    sort === 'following_new'
  )
}

export function buildBoundedPostSearchQuery(
  currentUser: BasicUser | undefined,
  options: PostSearchOptions,
  sort: PostSearchSort,
  decisionInstant: Date,
  hasTextSearch: boolean,
  hasSemanticSearch: boolean,
): SQLStatement {
  const cap = candidateCap(options)
  const rawSort = usesTopicBestCohort(options, sort) ? 'relevance' : sort
  // Hacker News new/best scans can carry their bounded post rows into the visibility pass.
  const includePostRows =
    options.has_hacker_news_references === true &&
    (sort === 'new' || sort === 'best') &&
    !indexServedDataPointTopicId(options, sort)
  const ctes = buildPostSearchCtes({ ...options, hasSemanticSearch, hasTextSearch })
  ctes.push(buildRawCandidates(options, rawSort, cap, rawSort !== sort, includePostRows))
  ctes.push(
    sql`bounded_post_search_candidates AS MATERIALIZED (
      SELECT * FROM raw_post_search_candidates ORDER BY `
      .append(candidateOrder(rawSort))
      .append(sql` LIMIT `)
      .append(candidateLimitLiteral(cap)).append(sql`
    )`),
  )
  ctes.push(buildBoundaryCte(rawSort))
  const query = sql`/* buildPostSearchQuery */
  `
  appendCtes(query, ctes)
  query.append(sql`SELECT visible.*, boundary.inspected_id, boundary.inspected_score,
    boundary.cohort_hi, boundary.cohort_lo, ${cap}::int AS candidate_cap,
    (SELECT COUNT(*) > ${cap} FROM raw_post_search_candidates) AS candidate_has_more
    FROM (SELECT 1) anchor
    LEFT JOIN LATERAL (`)
  const context = {
    currentUser,
    decisionInstant,
    followingRankExpression: null,
    hasSemanticSearch,
    hasTextSearch,
    options,
    indexedDataPointTopicId: indexServedDataPointTopicId(options, sort),
    rankingScoreExpression: buildPostRankingScoreExpression({ hasTextSearch, hasSemanticSearch }),
    sort,
  }
  appendPostSearchSelectAndJoins(query, {
    ...context,
    useBoundedCandidates: true,
    includeBoundedPostRows: includePostRows,
  })
  appendPostSearchWhereClause(query, {
    ...context,
    sort: sort === 'following_new' ? 'new' : sort,
    useBoundedCandidates: true,
  })
  if (sort === 'following_new') appendFollowingPhase(query, currentUser, options.following_phase)
  appendPostSearchOrderAndLimit(query, {
    followingRankExpression: null,
    hasSemanticSearch,
    hasTextSearch,
    limit: options.limit,
    omitLimit: false,
    omitOrderBy: false,
    sort: sort === 'following_new' ? 'new' : sort,
  })
  return query.append(sql`
    ) visible ON TRUE
    LEFT JOIN post_search_candidate_boundary boundary ON TRUE`)
}

function buildBoundaryCte(sort: PostSearchSort): SQLStatement {
  const boundaryScore =
    sort === 'best'
      ? 'votes_score_sort'
      : sort === 'hot' || sort === 'trending'
        ? 'stable_hot_rank'
        : 'NULL::DOUBLE PRECISION'
  const query = sql`post_search_candidate_boundary AS (
    SELECT id AS inspected_id, `
  query.append(boundaryScore).append(sql` AS inspected_score,
      (SELECT id FROM bounded_post_search_candidates ORDER BY id DESC LIMIT 1) AS cohort_hi,
      (SELECT id FROM bounded_post_search_candidates ORDER BY id ASC LIMIT 1) AS cohort_lo
    FROM bounded_post_search_candidates ORDER BY `)
  return query.append(candidateReverseOrder(sort)).append(sql` LIMIT 1
  )`)
}

function appendFollowingPhase(
  query: SQLStatement,
  currentUser: BasicUser | undefined,
  phase: 'followed' | 'other' | undefined,
): void {
  if (!currentUser) throw new Error('following_new requires currentUser')
  const membership = sql`EXISTS (
    SELECT 1 FROM LATERAL (
      SELECT follow_edge.deleted_at FROM relation__user__follow__user follow_edge
      WHERE follow_edge.subject_id = ${currentUser.id}
        AND follow_edge.object_id = posts.created_by_id
      LIMIT 1
    ) viewer_following
    WHERE viewer_following.deleted_at IS NULL
  )`
  query.append(
    phase === 'other' ? sql` AND NOT `.append(membership) : sql` AND `.append(membership),
  )
}
