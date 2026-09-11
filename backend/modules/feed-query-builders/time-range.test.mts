import { describe, expect, it } from 'vitest'
import type { TimeRange } from '@voucha/types/feed'
import { buildTimeRangeFilter, getTimeRangeLowerBoundDate } from './time-range.mts'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_WEEK_MS = 7 * ONE_DAY_MS

describe('buildTimeRangeFilter', () => {
  it('throws for an invalid idColumn', () => {
    expect(() => buildTimeRangeFilter('1d', 'posts.id; DROP TABLE users')).toThrow(
      'Invalid idColumn format: posts.id; DROP TABLE users',
    )
  })

  it('accepts a bare column name without a table prefix', () => {
    const filter = buildTimeRangeFilter('1w', 'id')

    expect(filter).not.toBeNull()
    expect(filter!.text).toContain('id >= $1')
  })

  it('returns null for "all" (no time filter)', () => {
    expect(buildTimeRangeFilter('all', 'posts.id')).toBeNull()
  })

  it('builds a parameterized filter for a bounded time range', () => {
    const filter = buildTimeRangeFilter('1d', 'posts.id')

    expect(filter).not.toBeNull()
    expect(filter!.text).toContain('posts.id >= $1')
    expect(filter!.values).toHaveLength(1)
  })
})

describe('getTimeRangeLowerBoundDate', () => {
  it('returns null for "all"', () => {
    expect(getTimeRangeLowerBoundDate('all')).toBeNull()
  })

  it('returns a date exactly 1 day before now for "1d"', () => {
    const before = Date.now()
    const bound = getTimeRangeLowerBoundDate('1d')
    const after = Date.now()

    expect(bound).not.toBeNull()
    expect(bound!.getTime()).toBeGreaterThanOrEqual(before - ONE_DAY_MS)
    expect(bound!.getTime()).toBeLessThanOrEqual(after - ONE_DAY_MS)
  })

  it('returns a date exactly 1 week before now for "1w"', () => {
    const before = Date.now()
    const bound = getTimeRangeLowerBoundDate('1w')
    const after = Date.now()

    expect(bound).not.toBeNull()
    expect(bound!.getTime()).toBeGreaterThanOrEqual(before - ONE_WEEK_MS)
    expect(bound!.getTime()).toBeLessThanOrEqual(after - ONE_WEEK_MS)
  })

  it('returns a date 1 UTC month before now for "1m"', () => {
    const now = new Date()
    const expected = new Date(now)
    expected.setUTCMonth(expected.getUTCMonth() - 1)

    const bound = getTimeRangeLowerBoundDate('1m')

    expect(bound).not.toBeNull()
    expect(Math.abs(bound!.getTime() - expected.getTime())).toBeLessThan(5000)
  })

  it('returns a date 1 UTC year before now for "1y"', () => {
    const now = new Date()
    const expected = new Date(now)
    expected.setUTCFullYear(expected.getUTCFullYear() - 1)

    const bound = getTimeRangeLowerBoundDate('1y')

    expect(bound).not.toBeNull()
    expect(Math.abs(bound!.getTime() - expected.getTime())).toBeLessThan(5000)
  })

  it('throws for an unknown time range', () => {
    expect(() => getTimeRangeLowerBoundDate('bogus' as TimeRange)).toThrow(
      'Unknown time range: bogus',
    )
  })
})
