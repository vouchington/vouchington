import { describe, expect, it } from 'vitest'
import { createTestSqlStatement } from '@voucha/test-helpers/sql-query-inputs'
import { appendRecommendationSelectAndOrder } from './query-filters.mts'

describe('recommendation sort selector guards', () => {
  it('rejects an unknown sort when assembling the select list', () => {
    expect(() =>
      appendRecommendationSelectAndOrder(
        createTestSqlStatement(),
        10,
        'unknown' as Parameters<typeof appendRecommendationSelectAndOrder>[2],
      ),
    ).toThrow('Unknown recommendation sort')
  })
})
