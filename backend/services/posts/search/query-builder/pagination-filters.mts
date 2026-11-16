import sql, { type SQLStatement } from 'sql-template-strings'
import createHttpError from 'http-errors'
import { buildPostSearchTimeRangeFilter } from '../hacker-news-hot-options.mts'
import { buildStablePostHotRankExpression } from '../stable-hot-rank.mts'
import type { PostSearchOptions } from '../types.mts'

export function buildPartitionAndPaginationFilters({
  decisionInstant,
  paginationOnly,
  followingRankExpression,
  hasSemanticSearch,
  hasTextSearch,
  options,
  rankingScoreExpression,
  sort,
}: {
  decisionInstant: Date
  paginationOnly: boolean
  followingRankExpression: SQLStatement | null
  hasSemanticSearch: boolean
  hasTextSearch: boolean
  options: PostSearchOptions
  rankingScoreExpression: SQLStatement | null
  sort: string
}): SQLStatement[] {
  const timeRangeFilter = paginationOnly
    ? null
    : buildPostSearchTimeRangeFilter(options, 'posts.id', decisionInstant)
  return [
    ...(timeRangeFilter ? [timeRangeFilter] : []),
    ...buildPaginationFilters({
      followingRankExpression,
      hasSemanticSearch,
      hasTextSearch,
      options,
      rankingScoreExpression,
      sort,
    }),
  ]
}

function buildPaginationFilters({
  followingRankExpression,
  hasSemanticSearch,
  hasTextSearch,
  options,
  rankingScoreExpression,
  sort,
}: {
  followingRankExpression: SQLStatement | null
  hasSemanticSearch: boolean
  hasTextSearch: boolean
  options: PostSearchOptions
  rankingScoreExpression: SQLStatement | null
  sort: string
}): SQLStatement[] {
  if (sort === 'new' && options.id_lt) {
    // community_id equality plus this id bound stays on (community_id, id) and stops at LIMIT.
    return [sql`posts.id < ${options.id_lt}`]
  } else if (sort === 'following_new' && (options.ranking_lt !== undefined || options.id_lt)) {
    return buildCompositePagination({
      expression: requiredFollowingRankExpression(followingRankExpression),
      idLt: options.id_lt,
      scoreLt: options.ranking_lt,
      scoreName: 'following_new cursor',
    })
  } else if (sort === 'best' && options.vote_score_lt !== undefined) {
    if (!options.id_lt) throw createHttpError(500, 'vote_score_lt requires id_lt')
    return [sql`(posts.votes_score_sort, posts.id) < (${options.vote_score_lt}, ${options.id_lt})`]
  } else if ((sort === 'hot' || sort === 'trending') && options.hot_score_lt !== undefined) {
    if (!options.id_lt) throw createHttpError(500, 'hot_score_lt requires id_lt')
    return buildCompositePagination({
      expression: buildStablePostHotRankExpression(),
      idLt: options.id_lt,
      scoreLt: options.hot_score_lt,
      scoreName: 'hot_score_lt',
    })
  } else if (sort === 'relevance' && options.ranking_lt !== undefined) {
    return buildCompositePagination({
      expression: requiredRankingExpression(rankingScoreExpression),
      idLt: options.id_lt,
      scoreLt: options.ranking_lt,
      scoreName: 'ranking_lt',
    })
  } else if (sort === 'relevance' && !hasTextSearch && !hasSemanticSearch && options.id_lt) {
    return [sql`posts.id < ${options.id_lt}`]
  }
  return []
}

function buildCompositePagination({
  expression,
  idLt,
  scoreLt,
  scoreName,
}: {
  expression: SQLStatement
  idLt?: string
  scoreLt?: number
  scoreName: string
}): SQLStatement[] {
  if (scoreLt === undefined) throw createHttpError(500, `${scoreName} requires ranking_lt`)
  if (!idLt) throw createHttpError(500, `${scoreName} requires id_lt`)
  return [sql`(`.append(expression).append(sql`, posts.id) < (${scoreLt}, ${idLt})`)]
}

function requiredFollowingRankExpression(expression: SQLStatement | null): SQLStatement {
  if (!expression) throw createHttpError(500, 'following_new requires currentUser')
  return expression
}

function requiredRankingExpression(expression: SQLStatement | null): SQLStatement {
  if (!expression) throw createHttpError(500, 'ranking_lt requires active relevance search')
  return expression
}
