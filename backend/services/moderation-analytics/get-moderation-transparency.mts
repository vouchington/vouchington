import { write } from '@data-stores/psql'
import {
  MODERATION_TRANSPARENCY_DELAY_MS,
  rollUpReleasedModerationTransparencyByMonth,
  sanitizeModerationTransparency,
  type ModerationTransparencyBucket,
  type ModerationTransparencyMetric,
  type ModerationTransparencyRawBucket,
} from './sanitize-moderation-transparency.mts'
import type { ModerationAnalyticsRange } from './types.mts'
import {
  getTransparencyWindow,
  hasOlderCommunityTransparencyEvents,
  hasOlderGlobalTransparencyEvents,
  releaseModerationTransparencyCohorts,
} from './all-time-transparency-pages.mts'
import sql from 'sql-template-strings'

export type ModerationTransparency = {
  range: ModerationAnalyticsRange
  buckets: ModerationTransparencyBucket[]
  /** Present only when an all-time monthly page has older released data. */
  next_cursor?: string
}

export async function getModerationTransparency(
  range: ModerationAnalyticsRange,
  now = new Date(),
  after?: string,
): Promise<ModerationTransparency> {
  const cutoff = getCompleteDailyCohortCutoff(now)
  const { periodStart, periodEnd, cursorScope } = getTransparencyWindow(range, cutoff, after)
  await releaseModerationTransparencyCohorts(
    undefined,
    periodStart,
    periodEnd,
    cutoff,
    range === 'all',
  )
  const { rows } = await write(sql`/* getModerationTransparency */
    SELECT day::text AS date, latest_occurred_at AS occurred_at, metric, category, count
    FROM moderation_transparency_released_daily_rollups
    WHERE community_id IS NULL
      AND day >= ${periodStart}::date AND day <= ${periodEnd}::date
    ORDER BY day, metric, category
  `)
  const rawBuckets = rows.map(row => {
    const bucket = row as {
      date: string
      occurred_at: Date
      metric: ModerationTransparencyMetric
      category: string
      count: number
    }
    return {
      date: bucket.date,
      occurred_at: bucket.occurred_at,
      metric: bucket.metric,
      category: bucket.category,
      count: bucket.count,
    }
  }) satisfies ModerationTransparencyRawBucket[]

  const result: ModerationTransparency = {
    range,
    buckets:
      range === 'all'
        ? rollUpReleasedModerationTransparencyByMonth(rawBuckets, now)
        : sanitizeModerationTransparency(rawBuckets, now),
  }
  if (range === 'all' && (await hasOlderGlobalTransparencyEvents(periodStart, cutoff))) {
    result.next_cursor = cursorScope!.nextCursor
  }
  return result
}

/** Community-scoped automated moderation only. The returned projection deliberately carries no community scope. */
export async function getCommunityModerationTransparency(
  communityId: string,
  range: ModerationAnalyticsRange,
  now = new Date(),
  after?: string,
): Promise<ModerationTransparency> {
  const cutoff = getCompleteDailyCohortCutoff(now)
  const { periodStart, periodEnd, cursorScope } = getTransparencyWindow(
    range,
    cutoff,
    after,
    `moderation-transparency:community:${communityId}:month-desc`,
  )
  await releaseModerationTransparencyCohorts(
    communityId,
    periodStart,
    periodEnd,
    cutoff,
    range === 'all',
  )
  const { rows } = await write(sql`/* getCommunityModerationTransparency */
    SELECT day::text AS date, latest_occurred_at AS occurred_at,
      metric, category, count
    FROM moderation_transparency_released_daily_rollups
    WHERE community_id = ${communityId}::uuid
      AND day >= ${periodStart}::date AND day <= ${periodEnd}::date
      AND metric = 'automated_moderation'
    ORDER BY day
  `)
  const rawBuckets = rows.map(row => {
    const bucket = row as { date: string; occurred_at: Date; category: string; count: number }
    return {
      date: bucket.date,
      occurred_at: bucket.occurred_at,
      metric: 'automated_moderation' as const,
      category: bucket.category,
      count: bucket.count,
    }
  }) satisfies ModerationTransparencyRawBucket[]
  const result: ModerationTransparency = {
    range,
    buckets:
      range === 'all'
        ? rollUpReleasedModerationTransparencyByMonth(rawBuckets, now)
        : sanitizeModerationTransparency(rawBuckets, now),
  }
  if (
    range === 'all' &&
    (await hasOlderCommunityTransparencyEvents(communityId, periodStart, cutoff))
  ) {
    result.next_cursor = cursorScope!.nextCursor
  }
  return result
}

/**
 * Disclosure uses whole UTC daily cohorts. The 48-hour event delay establishes
 * the latest eligible instant; this moves the query boundary back to the end
 * of the preceding UTC day so a later event cannot complete a published day.
 */
function getCompleteDailyCohortCutoff(now: Date): Date {
  const delayCutoff = new Date(now.getTime() - MODERATION_TRANSPARENCY_DELAY_MS)
  return new Date(
    Date.UTC(delayCutoff.getUTCFullYear(), delayCutoff.getUTCMonth(), delayCutoff.getUTCDate()) - 1,
  )
}
