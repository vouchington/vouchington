import type { BasicUser } from '@services/users/types'
import { getPostsWorkLimit } from '../../work-limits.mts'
import { hasSemanticSearch as hasSemanticSearchFilter } from '@modules/search-utils'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions, PostSearchSort } from '../types.mts'
import { buildStablePostHotRankExpression } from '../stable-hot-rank.mts'
import { buildPostRankingScoreExpression } from '../query-builder-utils.mts'
import { appendCtes, buildPostSearchCtes } from './ctes.mts'
import { appendPostSearchOrderAndLimit } from './order-and-limit.mts'
import { appendPostSearchSelectAndJoins } from './select-and-joins.mts'
import { appendPostSearchWhereClause } from './where-clause.mts'

const CANDIDATE_LIMIT = 'post_search_filter_candidate_limit'
type CandidateSort = 'new' | 'best' | 'hot' | 'trending'

/** Sparse approval/status filters inspect an index-ordered, finite prefix per request. */
export function usesBoundedPostSearchCandidates(
  options: PostSearchOptions,
  sort: PostSearchSort,
): boolean {
  if (options.omitLimit || options.omitOrderBy) return false
  // Semantic searches already have a finite nearest-vector candidate window. Keep that
  // window before hot ranking so hot does not select unrelated global candidates first.
  if (hasSemanticSearchFilter(options) && options.semanticSearchEmbedding !== undefined)
    return false
  const scoped = options.community_id !== undefined || isRecommendationScope(options)
  return sort === 'hot' || sort === 'trending' || (scoped && (sort === 'new' || sort === 'best'))
}

export function buildBoundedPostSearchQuery(
  currentUser: BasicUser | undefined,
  options: PostSearchOptions,
  sort: CandidateSort,
  decisionInstant: Date,
  hasTextSearch: boolean,
  hasSemanticSearch: boolean,
): SQLStatement {
  const cap = getPostsWorkLimit(CANDIDATE_LIMIT)
  const ctes = buildPostSearchCtes({ ...options, hasSemanticSearch, hasTextSearch })
  ctes.push(buildRawCandidates(options, sort, cap))
  const order = candidateOrder(sort)
  ctes.push(
    sql`bounded_post_search_candidates AS MATERIALIZED (
    SELECT * FROM raw_post_search_candidates ORDER BY `.append(order).append(sql` LIMIT ${cap}
  )`),
  )
  const boundaryScore =
    sort === 'new'
      ? 'NULL::DOUBLE PRECISION'
      : sort === 'best'
        ? 'votes_score_sort'
        : 'stable_hot_rank'
  const boundary = sql`post_search_candidate_boundary AS (
    SELECT id AS inspected_id, `
  boundary.append(boundaryScore).append(sql` AS inspected_score
    FROM bounded_post_search_candidates
    ORDER BY `)
  boundary.append(candidateReverseOrder(sort)).append(sql` LIMIT 1
  )`)
  ctes.push(boundary)

  const query = sql`/* buildPostSearchQuery */
  `
  appendCtes(query, ctes)
  query.append(sql`SELECT visible.*, boundary.inspected_id, boundary.inspected_score,
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
    rankingScoreExpression: buildPostRankingScoreExpression({
      hasTextSearch,
      hasSemanticSearch,
    }),
    sort,
  }
  appendPostSearchSelectAndJoins(query, { ...context, useBoundedCandidates: true })
  appendPostSearchWhereClause(query, { ...context, useBoundedCandidates: true })
  appendPostSearchOrderAndLimit(query, {
    followingRankExpression: null,
    hasSemanticSearch,
    hasTextSearch,
    limit: options.limit,
    omitLimit: false,
    omitOrderBy: false,
    sort,
  })
  return query.append(sql`
    ) visible ON TRUE
    LEFT JOIN post_search_candidate_boundary boundary ON TRUE`)
}

function buildRawCandidates(
  options: PostSearchOptions,
  sort: CandidateSort,
  cap: number,
): SQLStatement {
  const query = sql`raw_post_search_candidates AS MATERIALIZED (
    SELECT posts.id`
  if (sort === 'best') query.append(sql`, posts.votes_score_sort`)
  if (sort === 'hot' || sort === 'trending') {
    query
      .append(sql`, `)
      .append(buildStablePostHotRankExpression())
      .append(sql` AS stable_hot_rank`)
  }
  query.append(sql` FROM posts WHERE posts.deleted_at IS NULL`)
  if (sort === 'hot' || sort === 'trending') query.append(sql` AND posts.votes_score_net > 0`)
  if (options.community_id) query.append(sql` AND posts.community_id = ${options.community_id}`)
  if (!options.community_id && options.post_types?.length === 1) {
    const postType = options.post_types[0]
    if (sort === 'hot' || sort === 'trending') {
      query.append(sql` AND posts.post_type = ${postType}`)
    } else if (postType === 'topic_recommendation') {
      query.append(sql` AND posts.post_type = 'topic_recommendation'`)
    }
  } else if (
    !options.community_id &&
    !options.post_types?.length &&
    isRecommendationScope(options)
  ) {
    query.append(sql` AND posts.post_type = 'topic_recommendation'`)
  }
  if (sort === 'new' && options.id_lt) query.append(sql` AND posts.id < ${options.id_lt}`)
  if (sort === 'best' && options.vote_score_lt !== undefined && options.id_lt) {
    query.append(
      sql` AND (posts.votes_score_sort, posts.id) < (${options.vote_score_lt}, ${options.id_lt})`,
    )
  }
  if (
    (sort === 'hot' || sort === 'trending') &&
    options.hot_score_lt !== undefined &&
    options.id_lt
  ) {
    query
      .append(sql` AND (`)
      .append(buildStablePostHotRankExpression())
      .append(sql`, posts.id) < (${options.hot_score_lt}, ${options.id_lt})`)
  }
  return query.append(sql` ORDER BY `).append(candidateOrder(sort)).append(sql` LIMIT ${cap + 1}
  )`)
}

function candidateOrder(sort: CandidateSort): SQLStatement {
  if (sort === 'new') return sql`id DESC`
  if (sort === 'best') return sql`votes_score_sort DESC, id DESC`
  return sql`stable_hot_rank DESC, id DESC`
}

function candidateReverseOrder(sort: CandidateSort): SQLStatement {
  if (sort === 'new') return sql`id ASC`
  if (sort === 'best') return sql`votes_score_sort ASC, id ASC`
  return sql`stable_hot_rank ASC, id ASC`
}

function isRecommendationScope(options: PostSearchOptions): boolean {
  return (
    options.post_types?.includes('topic_recommendation') === true ||
    options.topic_recommendation_status !== undefined ||
    Boolean(options.topic_recommendation_q?.trim())
  )
}
