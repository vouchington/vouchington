import { assertNever } from '@modules/utils/assert-never'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { PostSearchSort } from '../types.mts'
import { buildStablePostHotRankExpression } from '../stable-hot-rank.mts'

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
    idRelation = 'posts',
    outputColumns = false,
    reverse = false,
  }: {
    followingRankExpression: SQLStatement | null
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    limit?: number
    omitLimit: boolean
    omitOrderBy: boolean
    sort: PostSearchSort
    idRelation?: string
    /** Order a page subquery by its selected aliases instead of posts columns. */
    outputColumns?: boolean
    /** Read the page subquery from its far end, to find its last row. */
    reverse?: boolean
  },
): void {
  if (!omitOrderBy)
    appendOrderBy(query, {
      reverse,
      followingRankExpression,
      hasSemanticSearch,
      hasTextSearch,
      sort,
      idRelation,
      outputColumns,
    })
  if (!omitLimit) {
    query.append(sql`
    LIMIT ${limit ?? 100}
  `)
  }
}

function appendOrderBy(
  query: SQLStatement,
  {
    reverse,
    ...options
  }: {
    followingRankExpression: SQLStatement | null
    hasSemanticSearch: boolean
    hasTextSearch: boolean
    sort: PostSearchSort
    idRelation: string
    outputColumns: boolean
    reverse: boolean
  },
): void {
  const clause = orderByClause(options)
  // Output-column orders carry no bound values, so flipping the direction in the text is safe.
  query.append(
    reverse && options.outputColumns
      ? sql``.append(clause.text.replaceAll(' DESC', ' ASC'))
      : clause,
  )
}

function orderByClause({
  followingRankExpression,
  hasSemanticSearch,
  hasTextSearch,
  sort,
  idRelation,
  outputColumns,
}: {
  followingRankExpression: SQLStatement | null
  hasSemanticSearch: boolean
  hasTextSearch: boolean
  sort: PostSearchSort
  idRelation: string
  outputColumns: boolean
}): SQLStatement {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(idRelation)) throw new Error('Unsafe post relation')
  const id = `${idRelation}.id`
  const score = (column: string) => (outputColumns ? column : `${idRelation}.${column}`)
  switch (sort) {
    case 'new':
      return sql`\n    ORDER BY `.append(id).append(sql` DESC`)
    case 'following_new':
      if (!outputColumns && !followingRankExpression)
        throw new Error('following_new sort requires a rank expression')
      return outputColumns
        ? sql`\n    ORDER BY following_rank DESC, `.append(id).append(sql` DESC`)
        : sql`\n    ORDER BY `
            .append(followingRankExpression!)
            .append(sql` DESC, `)
            .append(id)
            .append(sql` DESC`)
    case 'best':
      return sql`\n    ORDER BY `
        .append(score(outputColumns ? 'vote_score' : 'votes_score_sort'))
        .append(sql` DESC, `)
        .append(id)
        .append(sql` DESC`)
    case 'hot':
    case 'trending':
      if (outputColumns) return sql`\n    ORDER BY hot_score DESC, `.append(id).append(sql` DESC`)
      // The index expression, not the output alias, so the stable-rank leaf can stop at LIMIT.
      return sql`\n    ORDER BY `
        .append(buildStablePostHotRankExpression(idRelation))
        .append(sql` DESC, `)
        .append(id)
        .append(sql` DESC`)
    case 'relevance':
      return hasTextSearch || hasSemanticSearch
        ? sql`\n    ORDER BY ranking_score DESC, `.append(id).append(sql` DESC`)
        : sql`\n    ORDER BY `.append(id).append(sql` DESC`)
    default:
      return assertNever(sort, 'Unknown post search sort')
  }
}
