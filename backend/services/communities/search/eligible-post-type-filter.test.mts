import { describe, expect, it } from 'vitest'
import { createTestSqlStatement } from '@voucha/test-helpers/sql-query-inputs'
import { createTestUser } from '@voucha/test-helpers'
import { appendEligiblePostTypeFilter } from './eligible-post-type-filter.mts'

describe('community eligible post type SQL', () => {
  it('rejects an unknown runtime post type for an authenticated viewer', async () => {
    const viewer = await createTestUser()
    expect(() =>
      appendEligiblePostTypeFilter(
        createTestSqlStatement(),
        viewer,
        'unknown' as Parameters<typeof appendEligiblePostTypeFilter>[2],
      ),
    ).toThrow('Unknown eligible post type')
  })
})
