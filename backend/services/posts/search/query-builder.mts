import type { BasicUser } from '@services/users/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchOptions } from './types.mts'
import {
  detectSearchSort,
  hasSemanticSearch as hasSemanticSearchFn,
  hasTextSearch as hasTextSearchFn,
} from '@modules/search-utils'
import { buildHotScoreExpression, buildPostRankingScoreExpression } from './query-builder-utils.mts'
import { appendCtes, buildPostSearchCtes } from './query-builder/ctes.mts'
import { appendPostSearchOrderAndLimit } from './query-builder/order-and-limit.mts'
import { appendPostSearchSelectAndJoins } from './query-builder/select-and-joins.mts'
import { appendPostSearchWhereClause } from './query-builder/where-clause.mts'
import { buildSemanticPostCandidates } from './query-builder/semantic-candidates.mts'
import { usesHackerNewsHotCandidates } from './hacker-news-hot-options.mts'
import { buildHackerNewsHotCandidates } from './query-builder/hacker-news-hot-candidates.mts'

export function buildPostSearchQuery(
  currentUser?: BasicUser,
  options: PostSearchOptions = {},
): SQLStatement {
  const decisionInstant = new Date()
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
  const useHackerNewsHotCandidates = usesHackerNewsHotCandidates(options)
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
  // The positive votes index matches votes_score_net > 0, then filters a rare result or credit
  // value. Read those matches in id order first. Score and page that set afterward.
  const fenceHotExpressionFilter =
    sort === 'hot' &&
    !useHackerNewsHotCandidates &&
    (options.data_point_result !== undefined || options.data_point_credit_score_range !== undefined)
  if (fenceHotExpressionFilter) {
    query.append(
      ctes.length > 0
        ? sql`,
      data_point_hot_matches AS MATERIALIZED (`
        : sql`WITH data_point_hot_matches AS MATERIALIZED (`,
    )
  }
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
    deferHotScore: fenceHotExpressionFilter,
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
    deferHotPredicate: fenceHotExpressionFilter,
  })
  appendPostSearchOrderAndLimit(query, {
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    limit,
    omitLimit: fenceHotExpressionFilter || omitLimit,
    omitOrderBy: fenceHotExpressionFilter || omitOrderBy,
    sort,
  })
  if (fenceHotExpressionFilter) {
    query.append(sql`
    ORDER BY posts.id DESC)
  SELECT id, post_type, `)
    query.append(buildHotScoreExpression('data_point_hot_matches'))
    query.append(sql` AS hot_score`)
    if (options.hydrateDataPointPage)
      query.append(sql`, title, data_point_vertical, structured_data`)
    query.append(sql`
    FROM data_point_hot_matches
    WHERE votes_score_net > 0`)
    if (options.hot_score_lt !== undefined) {
      query.append(sql` AND (`)
      query.append(buildHotScoreExpression('data_point_hot_matches'))
      query.append(sql`, id) < (${options.hot_score_lt}, ${options.id_lt})`)
    }
    if (!omitOrderBy) query.append(sql` ORDER BY hot_score DESC, id DESC`)
    if (!omitLimit)
      query.append(sql`
    LIMIT ${limit ?? 100}
  `)
  }

  return query
}
