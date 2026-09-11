import { describe, expect, it } from 'vitest'
import {
  getMonthlyBackfillEntries,
  getNightlyBackfillEntries,
  getWeeklyBackfillEntries,
} from './backfill-utils.mts'

describe('sitemap backfill utilities', () => {
  it('builds a week of daily backfills for the nightly job', () => {
    const entries = getNightlyBackfillEntries(new Date('2026-03-03T07:15:00.000Z'), [
      'discussion',
    ] as const)

    expect(entries).toHaveLength(7)
    expect(entries.every(entry => entry.postType === 'discussion')).toBe(true)
    expect(entries.map(entry => entry.day)).toEqual([
      '2026-02-25',
      '2026-02-26',
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
    ])
  })

  it('builds a month of daily backfills for the weekly job', () => {
    const entries = getWeeklyBackfillEntries(new Date('2026-03-03T07:15:00.000Z'), [
      'discussion',
    ] as const)

    const uniqueDays = new Set(entries.map(entry => entry.day))

    expect(uniqueDays.size).toBe(30)
    expect(uniqueDays.has('2026-03-03')).toBe(true)
    expect(uniqueDays.has('2026-02-02')).toBe(true)
  })

  it('builds archive backfills older than the last 30 days for the monthly job', () => {
    const entries = getMonthlyBackfillEntries(
      new Date('2026-03-03T07:15:00.000Z'),
      {
        earliestDay: '2026-01-01',
        latestDay: '2026-03-03',
      },
      ['discussion'] as const,
    )

    const uniqueDays = new Set(entries.map(entry => entry.day))

    expect(uniqueDays.has('2026-01-01')).toBe(true)
    expect(uniqueDays.has('2026-01-31')).toBe(true)
    expect(uniqueDays.has('2026-02-01')).toBe(true)
    expect(uniqueDays.has('2026-02-02')).toBe(false)
  })
})
