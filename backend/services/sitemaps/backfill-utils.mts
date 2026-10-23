import type { SitemapPostType, TrackedDayRange } from './types.mts'
import { enumerateUtcDaysInclusive, getPreviousUtcDays } from '@ts-shared/utils/dates'
import { getSitemapsWorkLimit } from './work-limits.mts'

export function getNightlyBackfillEntries(
  now: Date,
  postTypes: readonly SitemapPostType[],
): Array<{ postType: SitemapPostType; day: string }> {
  return buildEntries(getPreviousUtcDays(7, { baseDate: now }), postTypes)
}

export function getWeeklyBackfillEntries(
  now: Date,
  postTypes: readonly SitemapPostType[],
): Array<{ postType: SitemapPostType; day: string }> {
  return buildEntries(
    getPreviousUtcDays(getSitemapsWorkLimit('weekly_backfill_days'), { baseDate: now }),
    postTypes,
  )
}

export type MonthlyBackfillPage = {
  entries: Array<{ postType: SitemapPostType; day: string }>
  /** The last day of this page; the next page starts after it. */
  lastDay: string | null
  hasMore: boolean
}

/**
 * One page of the archive backfill: the next `pageDays` days after `afterDay` (or from the earliest
 * tracked day), older than the weekly job's window, for every post type. A full page reports
 * `hasMore` so the caller continues from `lastDay`; the archive grows by a day every day, so no
 * single job ever enumerates all of it.
 */
export function getMonthlyBackfillPage(
  now: Date,
  trackedRange: TrackedDayRange | null,
  postTypes: readonly SitemapPostType[],
  { afterDay, pageDays }: { afterDay?: string; pageDays: number },
): MonthlyBackfillPage {
  const empty = { entries: [], lastDay: null, hasMore: false }
  if (!trackedRange) return empty

  const archiveEndDay = getPreviousUtcDays(getSitemapsWorkLimit('weekly_backfill_days') + 1, {
    baseDate: now,
  }).at(-1)
  if (!archiveEndDay || trackedRange.earliestDay > archiveEndDay) return empty

  const startDay =
    afterDay && afterDay > trackedRange.earliestDay ? afterDay : trackedRange.earliestDay
  if (startDay > archiveEndDay) return empty
  // Enumerate only this page and one day more (to learn whether another page follows), never the
  // whole remaining archive: the start day itself is dropped when it is the cursor.
  const windowEnd = addUtcDays(startDay, pageDays + 1)
  const remaining = enumerateUtcDaysInclusive(
    startDay,
    windowEnd < archiveEndDay ? windowEnd : archiveEndDay,
  ).filter(day => !afterDay || day > afterDay)
  const days = remaining.slice(0, pageDays)
  return {
    entries: buildEntries(days, postTypes),
    lastDay: days.at(-1) ?? null,
    hasMore: remaining.length > pageDays,
  }
}

function buildEntries(
  days: readonly string[],
  postTypes: readonly SitemapPostType[],
): Array<{ postType: SitemapPostType; day: string }> {
  const sortedDays = [...new Set(days)].toSorted()
  return postTypes.flatMap(postType => sortedDays.map(day => ({ postType, day })))
}

function addUtcDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
