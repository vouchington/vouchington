import { describe, expect, it } from 'vitest'
import { createTestSqlStatement } from '@voucha/test-helpers/sql-query-inputs'
import { appendFeedCategoryFilter } from './feed-category-filter.mts'

describe('community feed category SQL', () => {
  it('rejects an unknown runtime feed category before querying', () => {
    expect(() =>
      appendFeedCategoryFilter(
        createTestSqlStatement(),
        'unknown' as Parameters<typeof appendFeedCategoryFilter>[1],
      ),
    ).toThrow('Unknown community feed category')
  })
})
