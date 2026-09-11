import sql, { type SQLStatement } from 'sql-template-strings'

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
    sort: string
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
  {
    followingRankExpression,
    hasSemanticSearch,
    hasTextSearch,
    sort,
  }: {
    followingRankExpression: SQLStatement | null
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    sort: string
  },
): void {
  query.append(sql`
    ORDER BY `)
  if (sort === 'new') query.append(sql`posts.id DESC`)
  else if (sort === 'following_new' && followingRankExpression) {
    query.append(followingRankExpression)
    query.append(sql` DESC, posts.id DESC`)
  } else if (sort === 'best') query.append(sql`posts.votes_score_sort DESC, posts.id DESC`)
  else if (sort === 'hot') query.append(sql`hot_score DESC, posts.id DESC`)
  else if (sort === 'relevance') {
    query.append(
      hasTextSearch || hasSemanticSearch
        ? sql`ranking_score DESC, posts.id DESC`
        : sql`posts.id DESC`,
    )
  }
}
