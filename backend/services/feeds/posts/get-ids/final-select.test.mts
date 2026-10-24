import { describe, expect, it } from 'vitest'
import { createTestSqlStatement } from '@voucha/test-helpers'
import { appendPostFeedFinalSelect } from './final-select.mts'

describe('appendPostFeedFinalSelect', () => {
  it('rejects an unexpected runtime post feed sort', () => {
    const query = createTestSqlStatement()

    expect(() =>
      appendPostFeedFinalSelect(query, {
        cursor: {},
        safeLimit: 10,
        sort: 'unexpected' as Parameters<typeof appendPostFeedFinalSelect>[1]['sort'],
      }),
    ).toThrow('Unknown post feed sort')
  })
})
