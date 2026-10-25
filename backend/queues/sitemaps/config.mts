import { getCurrentUtcDay } from '@ts-shared/utils/dates'

export const SITEMAPS_DEDUPLICATION_TTL_MS = 60_000
const BACKFILL_SCHEDULE_UTC_HOUR = 7

export const BACKFILL_SCHEDULES = [
  {
    name: 'processNightlyBackfillWeekDispatcher',
    pattern: `0 ${BACKFILL_SCHEDULE_UTC_HOUR} * * *`,
  },
  {
    name: 'processWeeklyBackfillMonthDispatcher',
    pattern: `0 ${BACKFILL_SCHEDULE_UTC_HOUR} * * 0`,
  },
  {
    name: 'processMonthlyBackfillArchiveDispatcher',
    pattern: `0 ${BACKFILL_SCHEDULE_UTC_HOUR} 1 * *`,
  },
] as const

export function getSitemapsOrderingKeyForDay(day: string): 'post_day_today' | 'post_day_past' {
  return day === getCurrentUtcDay() ? 'post_day_today' : 'post_day_past'
}
