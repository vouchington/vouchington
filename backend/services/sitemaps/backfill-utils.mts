import type { SitemapPostType, TrackedDayRange } from './types.mts'
import { enumerateUtcDaysInclusive, getPreviousUtcDays } from '@ts-shared/utils/dates'

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
  return buildEntries(getPreviousUtcDays(30, { baseDate: now }), postTypes)
}

export function getMonthlyBackfillEntries(
  now: Date,
  trackedRange: TrackedDayRange | null,
  postTypes: readonly SitemapPostType[],
): Array<{ postType: SitemapPostType; day: string }> {
  if (!trackedRange) return []

  const archiveEndDay = getPreviousUtcDays(31, { baseDate: now }).at(-1)
  if (!archiveEndDay || trackedRange.earliestDay > archiveEndDay) {
    return []
  }

  return buildEntries(enumerateUtcDaysInclusive(trackedRange.earliestDay, archiveEndDay), postTypes)
}

function buildEntries(
  days: readonly string[],
  postTypes: readonly SitemapPostType[],
): Array<{ postType: SitemapPostType; day: string }> {
  const sortedDays = [...new Set(days)].toSorted()
  return postTypes.flatMap(postType => sortedDays.map(day => ({ postType, day })))
}
