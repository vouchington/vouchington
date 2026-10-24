import { describe, expect, it } from 'vitest'
import { communityCandidateSortTail, communitySelectedSortOrder } from './sort-tail.mts'

describe('community sort SQL', () => {
  it('rejects an unknown runtime sort in both query stages', () => {
    const sort = 'unknown' as Parameters<typeof communitySelectedSortOrder>[0]
    expect(() => communityCandidateSortTail(sort, {}, 10, false)).toThrow('Unknown community sort')
    expect(() => communitySelectedSortOrder(sort)).toThrow('Unknown community sort')
  })
})
