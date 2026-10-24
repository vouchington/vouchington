import { assertNever } from '@modules/utils/assert-never'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchSort } from '../types.mts'

export function appendPostSearchOrderAndLimit(
  query: SQLStatement,
  {
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    limit,
    omitLimit,
    omitOrderBy,
    sort,
  }: {
    followingRankExpression: SQLStatement | null
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    limit?: number
    omitLimit: boolean
    omitOrderBy: boolean
    sort: PostSearchSort
  },
): void {
  if (!omitOrderBy)
    appendOrderBy(query, { followingRankExpression, hasSemanticSearch, hasTextSearch, sort })
  if (!omitLimit) {
    query.append(sql`
    LIMIT ${limit ?? 100}
  `)
  }
}

function appendOrderBy(
  query: SQLStatement,
  options: {
    followingRankExpression: SQLStatement | null
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    sort: PostSearchSort
  },
): void {
  query.append(orderByClause(options))
}

function orderByClause({
  followingRankExpression,
  hasSemanticSearch,
  hasTextSearch,
  sort,
}: {
  followingRankExpression: SQLStatement | null
  hasSemanticSearch: boolean
  hasTextSearch: boolean
  sort: PostSearchSort
}): SQLStatement {
  switch (sort) {
    case 'new':
      return sql`
    ORDER BY posts.id DESC`
    case 'following_new':
      if (!followingRankExpression) throw new Error('following_new sort requires a rank expression')
      return sql`
    ORDER BY `
        .append(followingRankExpression)
        .append(sql` DESC, posts.id DESC`)
    case 'best':
      return sql`
    ORDER BY posts.votes_score_sort DESC, posts.id DESC`
    case 'hot':
      return sql`
    ORDER BY hot_score DESC, posts.id DESC`
    case 'relevance':
      return hasTextSearch || hasSemanticSearch
        ? sql`
    ORDER BY ranking_score DESC, posts.id DESC`
        : sql`
    ORDER BY posts.id DESC`
    default:
      return assertNever(sort, 'Unknown post search sort')
  }
}
