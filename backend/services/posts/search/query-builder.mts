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
import { usesHackerNewsHotCandidates } from './hacker-news-hot-options.mts'
import { getPostsWorkLimit } from '../work-limits.mts'

const INSPECTED_SORTS = new Set<PostSearchSort>([
  'new',
  'best',
  'hot',
  'trending',
  'relevance',
  'following_new',
])

/** Page size capped by the inspected-row limit. Semantic search keeps its vector window. */
export function postSearchStatementLimit(
  options: PostSearchOptions,
  sort: PostSearchSort,
  hasSemanticSearch: boolean,
): number | undefined {
  if (options.omitLimit) return undefined
  const requested = options.limit ?? 100
  const cap = inspectedRowCap(options, sort, hasSemanticSearch)
  return cap === null ? requested : Math.min(requested, cap)
}

export function buildPostSearchQuery(
  currentUser?: BasicUser,
  options: PostSearchOptions = {},
): SQLStatement {
  const decisionInstant = new Date()
  const { omitLimit = false, omitOrderBy = false, semanticSearchEmbedding } = options
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
    limit: postSearchStatementLimit(options, sort, hasSemanticSearch),
    omitLimit,
    omitOrderBy,
    sort,
  })

  return query
}

function inspectedRowCap(
  options: PostSearchOptions,
  sort: PostSearchSort,
  hasSemanticSearch: boolean,
): number | null {
  if (options.omitLimit || options.omitOrderBy) return null
  if (usesHackerNewsHotCandidates(options))
    return getPostsWorkLimit('hacker_news_hot_candidate_limit')
  if (hasSemanticSearch) return null
  if (!INSPECTED_SORTS.has(sort)) return null
  return getPostsWorkLimit('post_search_filter_candidate_limit')
}
