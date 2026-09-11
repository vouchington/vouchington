import type { BasicUser } from '@services/users/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions } from './types.mts'
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

export function buildPostSearchQuery(
  currentUser?: BasicUser,
  options: PostSearchOptions = {},
): SQLStatement {
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

  appendCtes(
    query,
    buildPostSearchCtes({
      ...options,
      hasSemanticSearch,
      hasTextSearch,
    }),
  )
  appendPostSearchSelectAndJoins(query, {
    currentUser,
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression,
    sort,
  })
  appendPostSearchWhereClause(query, {
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

  return query
}
