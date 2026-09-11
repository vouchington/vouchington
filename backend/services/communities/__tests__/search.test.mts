import { describe, expect, it } from 'vitest'
import { communitySearchSplitSuiteNames } from '../search.test-suites.mts'

describe('community search test suite', () => {
  it('tracks split community search suites', () => {
    expect(communitySearchSplitSuiteNames).toEqual(['search (sort)', 'search (filters)'])
  })
})
