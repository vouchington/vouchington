import { assertNever } from '@modules/utils/assert-never'
import type { BasicUser } from '@services/users/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions, PostSearchSort } from './types.mts'
import {
  detectSearchSort,
  hasSemanticSearch as hasSemanticSearchFn,
  hasTextSearch as hasTextSearchFn,
} from '@modules/search-utils'
import { buildPostRankingScoreExpression } from './query-builder-utils.mts'
import { appendCtes, buildPostSearchCtes } from './query-builder/ctes.mts'
import { appendPostSearchOrderAndLimit } from './query-builder/order-and-limit.mts'
import { appendPostSearchSelectAndJoins } from './query-builder/select-and-joins.mts'
import { appendPostSearchWhereClause } from './query-builder/where-clause.mts'
import { buildSemanticPostCandidates } from './query-builder/semantic-candidates.mts'

export function buildPostSearchQuery(
  currentUser?: BasicUser,
  options: PostSearchOptions = {},
): SQLStatement {
  const decisionInstant = options.time_range_as_of ?? new Date()
  const { limit, omitLimit = false, omitOrderBy = false, semanticSearchEmbedding } = options
  const hasTextSearch = hasTextSearchFn(options)
  const hasSemanticSearch = hasSemanticSearchFn(options) && semanticSearchEmbedding !== undefined
  const rawSort = detectSearchSort(options)
  const sort = rawSort === 'following_new' && !currentUser ? 'new' : rawSort
  const rankingScoreExpression = buildPostRankingScoreExpression({
    hasTextSearch,
    hasSemanticSearch,
  })
  const followingRankExpression =
    sort === 'following_new' && currentUser
      ? sql`CASE WHEN viewer_following.object_id IS NULL THEN 0 ELSE 1 END`
      : null
  const query = sql`/* buildPostSearchQuery */
  `

  const ctes = buildPostSearchCtes({
    ...options,
    hasSemanticSearch,
    hasTextSearch,
  })
  if (hasSemanticSearch)
    ctes.push(buildSemanticPostCandidates(currentUser, options, hasTextSearch, decisionInstant))
  appendCtes(query, ctes)
  // Community lists keep the checked candidate_posts name: one sort-key walk, then the page.
  if (options.community_id !== undefined) {
    query.append(
      ctes.length > 0
        ? sql`,\n candidate_posts AS NOT MATERIALIZED (`
        : sql`WITH candidate_posts AS NOT MATERIALIZED (`,
    )
  }
  appendPostSearchSelectAndJoins(query, {
    decisionInstant,
    useSemanticCandidates: hasSemanticSearch,
    currentUser,
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression,
    sort,
  })
  appendPostSearchWhereClause(query, {
    paginationOnly: false,
    decisionInstant,
    currentUser,
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression,
    sort,
  })
  appendPostSearchOrderAndLimit(query, {
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    limit,
    omitLimit,
    omitOrderBy,
    sort,
  })
  if (options.community_id !== undefined) {
    appendCommunityCandidatePage(query, {
      followingRankExpression,
      hasSemanticSearch,
      hasTextSearch,
      hydrate: options.hydrateDataPointPage === true,
      ranking: rankingScoreExpression !== null,
      sort,
    })
  }

  return query
}

function appendCommunityCandidatePage(
  query: SQLStatement,
  {
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    hydrate,
    ranking,
    sort,
  }: {
    followingRankExpression: SQLStatement | null
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    hydrate: boolean
    ranking: boolean
    sort: PostSearchSort
  },
): void {
  query.append(sql`)
    SELECT
      candidate_posts.id,
      candidate_posts.post_type`)
  if (hydrate) {
    query.append(sql`,
      candidate_posts.title,
      candidate_posts.data_point_vertical,
      candidate_posts.structured_data`)
  }
  if (ranking) query.append(sql`,\n      candidate_posts.ranking_score`)
  if (followingRankExpression) query.append(sql`,\n      candidate_posts.following_rank`)
  query.append(communitySortColumns(sort))
  query.append(sql`
    FROM candidate_posts`)
  appendPostSearchOrderAndLimit(query, {
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    omitLimit: true,
    omitOrderBy: false,
    sort,
    idRelation: 'candidate_posts',
    outputColumns: true,
  })
}

function communitySortColumns(sort: PostSearchSort): SQLStatement {
  switch (sort) {
    case 'best':
      return sql`,\n      candidate_posts.vote_score`
    case 'hot':
      return sql`,\n      candidate_posts.hot_score`
    case 'trending':
      return sql`,\n      candidate_posts.hot_score,\n      candidate_posts.trending_score`
    case 'new':
    case 'following_new':
    case 'relevance':
      return sql``
    default:
      return assertNever(sort, 'Unknown post search sort')
  }
}
