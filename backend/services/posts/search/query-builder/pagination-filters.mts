import sql, { type SQLStatement } from 'sql-template-strings'
import createHttpError from 'http-errors'
import { buildTimeRangeFilter } from '@modules/feed-query-builders'
import { buildHotScoreExpression } from '../query-builder-utils.mts'
import type { PostSearchOptions } from '../types.mts'

export function appendPartitionAndPaginationFilters(
  filters: SQLStatement[],
  {
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
  },
): void {
  const timeRangeFilter = buildTimeRangeFilter(options.time_range ?? 'all', 'posts.id')
  if (timeRangeFilter) filters.push(timeRangeFilter)
  appendPaginationFilters(filters, {
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    options,
    rankingScoreExpression,
    sort,
  })
}

function appendPaginationFilters(
  filters: SQLStatement[],
  {
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
  },
): void {
  if (sort === 'new' && options.id_lt) filters.push(sql`posts.id < ${options.id_lt}`)
  else if (sort === 'following_new' && (options.ranking_lt !== undefined || options.id_lt)) {
    appendCompositePagination(filters, {
      expression: requiredFollowingRankExpression(followingRankExpression),
      idLt: options.id_lt,
      scoreLt: options.ranking_lt,
      scoreName: 'following_new cursor',
    })
  } else if (sort === 'best' && options.vote_score_lt !== undefined) {
    if (!options.id_lt) throw createHttpError(500, 'vote_score_lt requires id_lt')
    filters.push(
      sql`(posts.votes_score_sort, posts.id) < (${options.vote_score_lt}, ${options.id_lt})`,
    )
  } else if (sort === 'hot' && options.hot_score_lt !== undefined) {
    appendCompositePagination(filters, {
      expression: buildHotScoreExpression(),
      idLt: options.id_lt,
      scoreLt: options.hot_score_lt,
      scoreName: 'hot_score_lt',
    })
  } else if (sort === 'relevance' && options.ranking_lt !== undefined) {
    appendCompositePagination(filters, {
      expression: requiredRankingExpression(rankingScoreExpression),
      idLt: options.id_lt,
      scoreLt: options.ranking_lt,
      scoreName: 'ranking_lt',
    })
  } else if (sort === 'relevance' && !hasTextSearch && !hasSemanticSearch && options.id_lt) {
    filters.push(sql`posts.id < ${options.id_lt}`)
  }
}

function appendCompositePagination(
  filters: SQLStatement[],
  {
    expression,
    idLt,
    scoreLt,
    scoreName,
  }: {
    expression: SQLStatement
    idLt?: string
    scoreLt?: number
    scoreName: string
  },
): void {
  if (scoreLt === undefined) throw createHttpError(500, `${scoreName} requires ranking_lt`)
  if (!idLt) throw createHttpError(500, `${scoreName} requires id_lt`)
  const filter = sql`(`
  filter.append(expression)
  filter.append(sql`, posts.id) < (${scoreLt}, ${idLt})`)
  filters.push(filter)
}

function requiredFollowingRankExpression(expression: SQLStatement | null): SQLStatement {
  if (!expression) throw createHttpError(500, 'following_new requires currentUser')
  return expression
}

function requiredRankingExpression(expression: SQLStatement | null): SQLStatement {
  if (!expression) throw createHttpError(500, 'ranking_lt requires active relevance search')
  return expression
}
