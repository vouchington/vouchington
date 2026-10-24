import { describe, expect, it } from 'vitest'
import { createTestSqlStatement } from '@voucha/test-helpers'
import { appendPostSearchOrderAndLimit } from './order-and-limit.mts'

describe('appendPostSearchOrderAndLimit', () => {
  it('rejects an unexpected runtime sort when ordering is requested', () => {
    const query = createTestSqlStatement()

    expect(() =>
      appendPostSearchOrderAndLimit(query, {
        followingRankExpression: null,
        hasSemanticSearch: false,
        hasTextSearch: false,
        omitLimit: true,
        omitOrderBy: false,
        sort: 'unexpected' as Parameters<typeof appendPostSearchOrderAndLimit>[1]['sort'],
      }),
    ).toThrow('Unknown post search sort')
  })
})
