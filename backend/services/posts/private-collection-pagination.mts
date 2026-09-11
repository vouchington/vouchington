import sql, { type SQLStatement } from 'sql-template-strings'

export interface PrivatePostCollectionCursor {
  timestamp: number
  id: string
}

interface PrivatePostCollectionOrderTerm {
  sqlExpression: `relation.${string}`
  cursorScopeField: `${string}-${string}`
  cursorValueSql: (cursor: PrivatePostCollectionCursor) => SQLStatement
}

interface PrivatePostCollectionPaginationDescriptor {
  direction: 'ASC' | 'DESC'
  boundaryOperator: '<' | '>'
  terms: readonly PrivatePostCollectionOrderTerm[]
}

export const PRIVATE_POST_COLLECTION_PAGINATION = definePaginationDescriptor('DESC', [
  {
    sqlExpression: 'relation.created_at',
    cursorScopeField: 'created-at',
    cursorValueSql: timestampCursorValueSql,
  },
  {
    sqlExpression: 'relation.object_id',
    cursorScopeField: 'object-id',
    cursorValueSql: idCursorValueSql,
  },
])

export const PRIVATE_POST_COLLECTION_ORDER = PRIVATE_POST_COLLECTION_PAGINATION.terms

export const PRIVATE_POST_COLLECTION_CURSOR_ORDER_SCOPE = PRIVATE_POST_COLLECTION_ORDER.map(
  term => `${term.cursorScopeField}-${PRIVATE_POST_COLLECTION_PAGINATION.direction.toLowerCase()}`,
).join('-')

export function appendPrivatePostCollectionCursorBoundary(
  query: SQLStatement,
  cursor: PrivatePostCollectionCursor,
): SQLStatement {
  query.append(
    `\n      AND (${PRIVATE_POST_COLLECTION_ORDER.map(term => term.sqlExpression).join(', ')}) ${PRIVATE_POST_COLLECTION_PAGINATION.boundaryOperator} (`,
  )
  PRIVATE_POST_COLLECTION_ORDER.forEach((term, index) => {
    if (index > 0) query.append(', ')
    query.append(term.cursorValueSql(cursor))
  })
  return query.append(')')
}

export function appendPrivatePostCollectionOrder(query: SQLStatement): SQLStatement {
  const orderBy = PRIVATE_POST_COLLECTION_ORDER.map(
    term => `${term.sqlExpression} ${PRIVATE_POST_COLLECTION_PAGINATION.direction}`,
  ).join(', ')
  return query.append(`\n    ORDER BY ${orderBy}`)
}

function definePaginationDescriptor(
  direction: PrivatePostCollectionPaginationDescriptor['direction'],
  terms: readonly PrivatePostCollectionOrderTerm[],
): PrivatePostCollectionPaginationDescriptor {
  return {
    direction,
    boundaryOperator: direction === 'DESC' ? '<' : '>',
    terms,
  }
}

function timestampCursorValueSql(cursor: PrivatePostCollectionCursor): SQLStatement {
  return sql`TO_TIMESTAMP(${cursor.timestamp}::numeric / 1000000)`
}

function idCursorValueSql(cursor: PrivatePostCollectionCursor): SQLStatement {
  return sql`${cursor.id}::uuid`
}
