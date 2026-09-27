import { describe, expect, it } from 'vitest'
import { getCutoffDateForTimeRange } from './query-utils.mts'

describe('RSS feed cutoff', () => {
  it('getCutoffDateForTimeRange derives a UUIDv7 lower bound for bounded ranges', () => {
    const result = getCutoffDateForTimeRange('1w')

    expect(result.cutoffDate).toBeInstanceOf(Date)
    expect(result.itemCutoffId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })
})
