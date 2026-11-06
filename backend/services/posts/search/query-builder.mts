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
import { buildSemanticPostCandidates } from './query-builder/semantic-candidates.mts'
import {
  normalizeHackerNewsHotSearch,
  usesHackerNewsHotCandidates,
} from './hacker-news-hot-options.mts'
import { buildHackerNewsHotCandidates } from './query-builder/hacker-news-hot-candidates.mts'

export function buildPostSearchQuery(
  currentUser?: BasicUser,
  input: PostSearchOptions = {},
): SQLStatement {
  const options = normalizeHackerNewsHotSearch(input)
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
  if (hasSemanticSearch) ctes.push(buildSemanticPostCandidates(currentUser, options, hasTextSearch))
  const useHackerNewsHotCandidates = usesHackerNewsHotCandidates(options)
  if (useHackerNewsHotCandidates) {
    ctes.push(
      buildHackerNewsHotCandidates(
        currentUser,
        options,
        hasTextSearch,
        hasSemanticSearch,
        rankingScoreExpression,
      ),
    )
  }
  appendCtes(query, ctes)
  appendPostSearchSelectAndJoins(query, {
    useSemanticCandidates: hasSemanticSearch,
    useHackerNewsHotCandidates,
    currentUser,
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression:
      useHackerNewsHotCandidates && rankingScoreExpression
        ? sql`posts.ranking_score`
        : rankingScoreExpression,
    sort,
  })
  appendPostSearchWhereClause(query, {
    paginationOnly: useHackerNewsHotCandidates,
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
