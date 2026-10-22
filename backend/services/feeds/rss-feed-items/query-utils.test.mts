import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getCutoffDateForTimeRange } from './query-utils.mts'

describe('RSS feed cutoff', () => {
  it('getCutoffDateForTimeRange derives a UUIDv7 lower bound for bounded ranges', () => {
    const result = getCutoffDateForTimeRange('1w')

    expect(result.cutoffDate).toBeInstanceOf(Date)
    expect(result.itemCutoffId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('derives the timestamp and exact UUID minimum from one supplied instant', () => {
    const now = new Date('2024-04-01T00:00:00.000Z')
    const cutoff = new Date('2024-03-01T00:00:00.000Z')
    expect(getCutoffDateForTimeRange('1m', now)).toEqual({
      cutoffDate: cutoff,
      itemCutoffId: getMinUUIDv7ForDate(cutoff),
    })
    expect(getCutoffDateForTimeRange('all', now)).toEqual({
      cutoffDate: null,
      itemCutoffId: null,
    })
  })
})
