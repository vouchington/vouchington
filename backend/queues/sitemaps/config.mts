import { entityOrderingKey } from '@queues/background/enqueues/define-job'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'

export const SITEMAPS_DEDUPLICATION_TTL_MS = 60_000
const BACKFILL_SCHEDULE_UTC_HOUR = 7

// Namespaced lanes, each running one job at a time: today's post-day sitemaps, past post-day
// sitemaps, the index sitemaps, and the backfill dispatchers.
export const SITEMAPS_ORDERING = {
  post_day_today: { key: entityOrderingKey('sitemaps', 'post_day_today'), concurrency: 1 },
  post_day_past: { key: entityOrderingKey('sitemaps', 'post_day_past'), concurrency: 1 },
  indexes: { key: entityOrderingKey('sitemaps', 'indexes'), concurrency: 1 },
  dispatcher: { key: entityOrderingKey('sitemaps', 'dispatcher'), concurrency: 1 },
} as const

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
