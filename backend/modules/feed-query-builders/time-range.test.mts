import { describe, expect, it } from 'vitest'
import type { TimeRange } from '@voucha/types/feed'
import { buildTimeRangeFilter, getTimeRangeLowerBoundDate } from './time-range.mts'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_WEEK_MS = 7 * ONE_DAY_MS
const PROOF_INSTANTS = [
  '2026-10-05T23:59:40.000Z',
  '2026-10-06T00:01:13.000Z',
  '2026-10-31T12:00:00.000Z',
] as const

function proofInstants(): readonly Date[] {
  const override = process.env.VOUCH_PROOF_NOW
  const isos = override === undefined ? PROOF_INSTANTS : [override]
  return isos.map(iso => new Date(iso))
}

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

  it('returns a date exactly 1 day before the pinned clock for "1d"', () => {
    for (const now of proofInstants()) {
      const bound = getTimeRangeLowerBoundDate('1d', now)

      expect(bound).not.toBeNull()
      expect(bound!.getTime()).toBe(now.getTime() - ONE_DAY_MS)
    }
  })

  it('returns a date exactly 1 week before the pinned clock for "1w"', () => {
    for (const now of proofInstants()) {
      const bound = getTimeRangeLowerBoundDate('1w', now)

      expect(bound).not.toBeNull()
      expect(bound!.getTime()).toBe(now.getTime() - ONE_WEEK_MS)
    }
  })

  it('returns a date 1 UTC month before the pinned clock for "1m"', () => {
    for (const now of proofInstants()) {
      const expected = new Date(now)
      expected.setUTCMonth(expected.getUTCMonth() - 1)
      const bound = getTimeRangeLowerBoundDate('1m', now)

      expect(bound).not.toBeNull()
      expect(bound!.getTime()).toBe(expected.getTime())
    }
  })

  it('returns a date 1 UTC year before the pinned clock for "1y"', () => {
    for (const now of proofInstants()) {
      const expected = new Date(now)
      expected.setUTCFullYear(expected.getUTCFullYear() - 1)
      const bound = getTimeRangeLowerBoundDate('1y', now)

      expect(bound).not.toBeNull()
      expect(bound!.getTime()).toBe(expected.getTime())
    }
  })

  it('throws for an unknown time range', () => {
    expect(() => getTimeRangeLowerBoundDate('bogus' as TimeRange)).toThrow(
      'Unknown time range: bogus',
    )
  })
})
