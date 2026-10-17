import { describe, expect, it } from 'vitest'
import {
  getMonthlyBackfillPage,
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
    const page = getMonthlyBackfillPage(
      new Date('2026-03-03T07:15:00.000Z'),
      { earliestDay: '2026-01-01', latestDay: '2026-03-03' },
      ['discussion'] as const,
      { pageDays: 1_000 },
    )

    const uniqueDays = new Set(page.entries.map(entry => entry.day))

    expect(uniqueDays.has('2026-01-01')).toBe(true)
    expect(uniqueDays.has('2026-01-31')).toBe(true)
    expect(uniqueDays.has('2026-02-01')).toBe(true)
    expect(uniqueDays.has('2026-02-02')).toBe(false)
    expect(page.hasMore).toBe(false)
  })

  it('pages the archive by day: no page exceeds the size and every day is covered once', () => {
    const now = new Date('2026-03-03T07:15:00.000Z')
    const range = { earliestDay: '2026-01-01', latestDay: '2026-03-03' }
    const covered: string[] = []
    let afterDay: string | undefined
    let pages = 0

    for (;;) {
      const page = getMonthlyBackfillPage(now, range, ['discussion', 'review'] as const, {
        afterDay,
        pageDays: 10,
      })
      pages += 1
      const days = [...new Set(page.entries.map(entry => entry.day))]
      expect(days.length).toBeLessThanOrEqual(10)
      expect(page.entries).toHaveLength(days.length * 2)
      covered.push(...days)
      if (!page.hasMore) break
      expect(page.lastDay).toBe(days.toSorted().at(-1))
      afterDay = page.lastDay!
    }

    // 2026-01-01 through 2026-02-01 is 32 days: three full pages and a final page of two.
    expect(pages).toBe(4)
    expect(covered).toHaveLength(32)
    expect(new Set(covered).size).toBe(32)
  })

  it('returns an empty page without a tracked range or past the archive end', () => {
    const now = new Date('2026-03-03T07:15:00.000Z')
    const empty = { entries: [], lastDay: null, hasMore: false }
    expect(getMonthlyBackfillPage(now, null, ['discussion'] as const, { pageDays: 5 })).toEqual(
      empty,
    )
    expect(
      getMonthlyBackfillPage(
        now,
        { earliestDay: '2026-03-01', latestDay: '2026-03-03' },
        ['discussion'] as const,
        { pageDays: 5 },
      ),
    ).toEqual(empty)
    expect(
      getMonthlyBackfillPage(
        now,
        { earliestDay: '2026-01-01', latestDay: '2026-03-03' },
        ['discussion'] as const,
        { afterDay: '2026-02-01', pageDays: 5 },
      ),
    ).toEqual(empty)
    expect(
      getMonthlyBackfillPage(
        now,
        { earliestDay: '2026-01-01', latestDay: '2026-03-03' },
        ['discussion'] as const,
        { afterDay: '2026-02-15', pageDays: 5 },
      ),
    ).toEqual(empty)
  })
})
