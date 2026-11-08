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
import { usesHackerNewsHotCandidates } from './hacker-news-hot-options.mts'
import { buildHackerNewsHotCandidates } from './query-builder/hacker-news-hot-candidates.mts'
import {
  buildBoundedPostSearchQuery,
  usesBoundedPostSearchCandidates,
} from './query-builder/bounded-candidates.mts'

export function buildPostSearchQuery(
  currentUser?: BasicUser,
  options: PostSearchOptions = {},
): SQLStatement {
  const pinnedDecisionInstant = options.time_range_as_of
  const decisionInstant =
    pinnedDecisionInstant instanceof Date && !Number.isNaN(pinnedDecisionInstant.getTime())
      ? pinnedDecisionInstant
      : new Date()
  const { limit, omitLimit = false, omitOrderBy = false, semanticSearchEmbedding } = options
  const hasTextSearch = hasTextSearchFn(options)
  const hasSemanticSearch = hasSemanticSearchFn(options) && semanticSearchEmbedding !== undefined
  const rawSort = detectSearchSort(options)
  const sort = rawSort === 'following_new' && !currentUser ? 'new' : rawSort
  if (
    (sort === 'new' || sort === 'best' || sort === 'hot' || sort === 'trending') &&
    usesBoundedPostSearchCandidates(options, sort)
  ) {
    return buildBoundedPostSearchQuery(
      currentUser,
      options,
      sort,
      decisionInstant,
      hasTextSearch,
      hasSemanticSearch,
    )
  }
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
  // Facet count queries omit ordering and limits; retain their finite HN cohort.
  // List queries use the shared bounded rank candidates above.
  const useHackerNewsHotCandidates =
    (omitLimit || omitOrderBy) && usesHackerNewsHotCandidates(options)
  if (useHackerNewsHotCandidates) {
    ctes.push(
      buildHackerNewsHotCandidates(
        currentUser,
        options,
        hasTextSearch,
        hasSemanticSearch,
        rankingScoreExpression,
        decisionInstant,
      ),
    )
  }
  appendCtes(query, ctes)
  appendPostSearchSelectAndJoins(query, {
    decisionInstant,
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

  return query
}
