import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import { write } from '@data-stores/psql'
import {
  getCompleteDailyCohortCutoff,
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
      category: FiniteValue<'moderation_transparency_categories'>
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
    const bucket = row as {
      date: string
      occurred_at: Date
      category: FiniteValue<'moderation_transparency_categories'>
      count: number
    }
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
