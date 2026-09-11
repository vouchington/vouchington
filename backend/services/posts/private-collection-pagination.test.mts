import { describe, expect, it } from 'vitest'
import { createTestSqlStatement } from '@voucha/test-helpers'
import {
  appendPrivatePostCollectionCursorBoundary,
  appendPrivatePostCollectionOrder,
  PRIVATE_POST_COLLECTION_CURSOR_ORDER_SCOPE,
  PRIVATE_POST_COLLECTION_ORDER,
  PRIVATE_POST_COLLECTION_PAGINATION,
} from './private-collection-pagination.mts'

describe('private post collection pagination order', () => {
  it('derives the SQL order and cursor scope from the same typed terms', () => {
    const query = createTestSqlStatement()
    appendPrivatePostCollectionCursorBoundary(query, {
      timestamp: 1_700_000_000_000_000,
      id: '019d0000-0000-7000-8000-000000000003',
    })
    appendPrivatePostCollectionOrder(query)

    expect(PRIVATE_POST_COLLECTION_ORDER).toEqual([
      expect.objectContaining({
        sqlExpression: 'relation.created_at',
        cursorScopeField: 'created-at',
      }),
      expect.objectContaining({
        sqlExpression: 'relation.object_id',
        cursorScopeField: 'object-id',
      }),
    ])
    expect(PRIVATE_POST_COLLECTION_PAGINATION).toMatchObject({
      direction: 'DESC',
      boundaryOperator: '<',
    })
    expect(query.sql).toContain(
      'AND (relation.created_at, relation.object_id) < (TO_TIMESTAMP(?::numeric / 1000000), ?::uuid)',
    )
    expect(query.sql).toContain('ORDER BY relation.created_at DESC, relation.object_id DESC')
    expect(query.values).toEqual([1_700_000_000_000_000, '019d0000-0000-7000-8000-000000000003'])
    expect(PRIVATE_POST_COLLECTION_CURSOR_ORDER_SCOPE).toBe('created-at-desc-object-id-desc')
  })
})
