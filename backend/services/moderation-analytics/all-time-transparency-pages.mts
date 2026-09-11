import { write } from '@data-stores/psql'
import { decodeScopedTimestampUuidCursor, encodeCursor } from '@modules/pagination'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import createHttpError from 'http-errors'
import {
  MODERATION_TRANSPARENCY_DELAY_MS,
  sanitizeModerationTransparency,
  type ModerationTransparencyMetric,
  type ModerationTransparencyRawBucket,
} from './sanitize-moderation-transparency.mts'
import type { ModerationAnalyticsRange } from './types.mts'
import sql from 'sql-template-strings'
import {
  releaseModerationTransparencyCandidates,
  type ModerationTransparencyReleaseCandidate,
} from './release-moderation-transparency-candidates.mts'

const ALL_TIME_PAGE_MONTHS = 12
const MAX_UUIDV7_TIMESTAMP_MS = 0xffffffffffff
const GLOBAL_CURSOR_SCOPE = 'moderation-transparency:global:month-desc'

export function getTransparencyWindow(
  range: ModerationAnalyticsRange,
  cutoff: Date,
  after?: string,
  scope = GLOBAL_CURSOR_SCOPE,
): { periodStart: Date; periodEnd: Date; cursorScope?: { nextCursor: string } } {
  if (range !== 'all') {
    return { periodStart: getTransparencyRangeStart(range, cutoff), periodEnd: cutoff }
  }
  const periodEnd = after ? getAllTimePeriodEnd(after, scope) : cutoff
  const periodStart = new Date(
    Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - (ALL_TIME_PAGE_MONTHS - 1), 1),
  )
  if (!isUuidV7Timestamp(periodStart.getTime())) {
    throw createHttpError(400, 'Invalid moderation transparency cursor')
  }
  return {
    periodStart,
    periodEnd,
    cursorScope: { nextCursor: encodeTransparencyCursor(periodStart, scope) },
  }
}

/** Materialize every eligible aggregate before serving it, fixing its public value permanently. */
export async function releaseModerationTransparencyCohorts(
  communityId: string | undefined,
  periodStart: Date,
  periodEnd: Date,
  cutoff: Date,
  releaseContinuation: boolean,
): Promise<void> {
  const { rows } = await write(sql`/* listReleasableModerationTransparencyCohorts */
    SELECT day, community_id, metric, category
    FROM moderation_transparency_daily_rollups
    WHERE community_id IS NOT DISTINCT FROM ${communityId ?? null}::uuid
      AND day >= ${periodStart}::date AND day <= ${periodEnd}::date
      AND count >= 20 AND latest_occurred_at <= ${cutoff}
    ORDER BY day, metric, category
  `)
  // Each candidate is released in its own transaction. Transaction-scoped
  // cohort locks must never be accumulated while a source-row cascade can
  // take them in a different order.
  await releaseModerationTransparencyCandidates(
    rows as ModerationTransparencyReleaseCandidate[],
    cutoff,
  )
  if (releaseContinuation) {
    await write(sql`/* releaseNextModerationTransparencyCohort */
      SELECT fn_release_next_moderation_transparency_daily_rollup(
        ${communityId}::uuid, ${periodStart}::date, ${cutoff}
      )
    `)
  }
}

/** Paid transparency releases whole UTC daily cohorts, unlike raw rolling analytics. */
export function getTransparencyRangeStart(range: ModerationAnalyticsRange, cutoff: Date): Date {
  const start = new Date(cutoff)
  start.setUTCHours(0, 0, 0, 0)
  switch (range) {
    case 'today':
      return start
    case '7d':
      start.setUTCDate(start.getUTCDate() - 6)
      return start
    case '30d':
      start.setUTCDate(start.getUTCDate() - 29)
      return start
    case '90d':
      start.setUTCDate(start.getUTCDate() - 89)
      return start
    case 'all':
      return new Date(0)
  }
}

function getAllTimePeriodEnd(after: string, scope: string): Date {
  const { id, timestamp } = decodeScopedTimestampUuidCursor(
    after,
    scope,
    'Invalid moderation transparency cursor',
  )
  const boundary = new Date(timestamp)
  if (
    timestamp < 1 ||
    timestamp > MAX_UUIDV7_TIMESTAMP_MS ||
    !isUtcMonthBoundary(boundary) ||
    id !== getMinUUIDv7ForDate(boundary)
  ) {
    throw createHttpError(400, 'Invalid moderation transparency cursor')
  }
  return new Date(timestamp - 1)
}

function isUtcMonthBoundary(date: Date): boolean {
  return (
    date.getUTCDate() === 1 &&
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  )
}

function isUuidV7Timestamp(timestamp: number): boolean {
  return Number.isSafeInteger(timestamp) && timestamp >= 0 && timestamp <= MAX_UUIDV7_TIMESTAMP_MS
}

/**
 * A continuation is itself a disclosure signal, so it is offered only when an
 * older UTC daily cohort can pass the same release boundary as page data.
 */
export async function hasOlderGlobalTransparencyEvents(
  periodStart: Date,
  cutoff: Date,
): Promise<boolean> {
  const { rows } = await write(sql`/* hasOlderGlobalModerationTransparencyEvents */
    SELECT day::text AS date, latest_occurred_at AS occurred_at, metric, category, count
    FROM moderation_transparency_released_daily_rollups
    WHERE community_id IS NULL AND day < ${periodStart}::date
      AND count >= 20 AND latest_occurred_at <= ${cutoff}
      AND category <> 'community_ai'
    ORDER BY day DESC
    LIMIT 1
  `)
  return hasReleasedDailyCohort(rows, cutoff)
}

export async function hasOlderCommunityTransparencyEvents(
  communityId: string,
  periodStart: Date,
  cutoff: Date,
): Promise<boolean> {
  const { rows } = await write(sql`/* hasOlderCommunityModerationTransparencyEvents */
    SELECT day::text AS date, latest_occurred_at AS occurred_at, metric, category, count
    FROM moderation_transparency_released_daily_rollups
    WHERE community_id = ${communityId}::uuid AND day < ${periodStart}::date
      AND count >= 20 AND latest_occurred_at <= ${cutoff}
    ORDER BY day DESC
    LIMIT 1
  `)
  return hasReleasedDailyCohort(rows, cutoff)
}

function hasReleasedDailyCohort(rows: unknown[], cutoff: Date): boolean {
  const dailyBuckets = rows.map(row => {
    const bucket = row as {
      date: string
      occurred_at: Date
      metric: ModerationTransparencyMetric
      category: string
      count: number
    }
    return bucket
  }) satisfies ModerationTransparencyRawBucket[]
  return (
    sanitizeModerationTransparency(
      dailyBuckets,
      new Date(cutoff.getTime() + MODERATION_TRANSPARENCY_DELAY_MS),
    ).length > 0
  )
}

function encodeTransparencyCursor(periodStart: Date, scope: string): string {
  return encodeCursor({
    timestamp: periodStart.getTime(),
    id: getMinUUIDv7ForDate(periodStart),
    scope,
  })
}
