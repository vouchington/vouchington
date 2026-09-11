export const MODERATION_TRANSPARENCY_DELAY_MS = 48 * 60 * 60 * 1000
export const MODERATION_TRANSPARENCY_MINIMUM_COHORT_SIZE = 20
export const MODERATION_TRANSPARENCY_ROUNDING_INCREMENT = 5

export type ModerationTransparencyMetric =
  | 'appeals'
  | 'automated_moderation'
  | 'moderation_actions'
  | 'reports'

export type ModerationTransparencyRawBucket = {
  date: string
  occurred_at: Date
  metric: ModerationTransparencyMetric
  category: string
  count: number
}

export type ModerationTransparencyBucket = {
  date: string
  metric: ModerationTransparencyMetric
  category: string
  count: number
}

const MODERATION_TRANSPARENCY_CATEGORIES = {
  appeals: new Set(['accept', 'deny', 'reduce']),
  automated_moderation: new Set([
    'agent_moderation',
    'community_ai',
    'openai_omni',
    'spam_detection',
    'post_clearance_reject',
  ]),
  moderation_actions: new Set([
    'remove',
    'approve',
    'reject',
    'ban',
    'lift_ban',
    'activate_restriction',
    'lift_restriction',
    'warn',
    'lock',
    'unlock',
    'pin',
    'unpin',
    'tag',
    'suspend',
    'unsuspend',
    'remove_member',
    'change_role',
    'resolve_report',
    'dismiss_report',
    'resolve_appeal',
    'dismiss_appeal',
  ]),
  reports: new Set([
    'spam',
    'harassment',
    'misinformation',
    'illegal_content',
    'other',
    'vote_manipulation',
  ]),
} satisfies Record<ModerationTransparencyMetric, ReadonlySet<string>>

/**
 * The only release boundary for paid moderation transparency. Callers must pass
 * aggregate-only rows; this function intentionally has no identity, prompt, or scope fields.
 */
export function sanitizeModerationTransparency(
  buckets: ModerationTransparencyRawBucket[],
  now = new Date(),
): ModerationTransparencyBucket[] {
  const cutoff = now.getTime() - MODERATION_TRANSPARENCY_DELAY_MS
  return buckets.flatMap(bucket => {
    const occurredAt = bucket.occurred_at.getTime()
    const bucketDate = new Date(`${bucket.date}T00:00:00.000Z`)
    // Database aggregates are whole, finite, non-negative counts. Treat malformed
    // input as withheld rather than attempting to coerce a potentially unsafe value.
    if (
      !Number.isFinite(occurredAt) ||
      !Number.isFinite(cutoff) ||
      !Number.isFinite(bucketDate.getTime()) ||
      bucketDate.toISOString().slice(0, 10) !== bucket.date ||
      occurredAt > cutoff ||
      !MODERATION_TRANSPARENCY_CATEGORIES[bucket.metric]?.has(bucket.category)
    ) {
      return []
    }
    if (
      !Number.isSafeInteger(bucket.count) ||
      bucket.count < MODERATION_TRANSPARENCY_MINIMUM_COHORT_SIZE
    ) {
      return []
    }
    return [
      {
        date: bucket.date,
        metric: bucket.metric,
        category: bucket.category,
        count: roundModerationTransparencyCount(bucket.count),
      },
    ]
  })
}

/**
 * `all` must not turn several private daily cohorts into a releasable monthly
 * total. Release and round the daily projection first, then sum only those
 * already-safe aggregates into the month returned to clients.
 */
export function rollUpReleasedModerationTransparencyByMonth(
  dailyBuckets: ModerationTransparencyRawBucket[],
  now = new Date(),
): ModerationTransparencyBucket[] {
  const monthlyBuckets = new Map<string, ModerationTransparencyBucket>()
  for (const bucket of sanitizeModerationTransparency(dailyBuckets, now)) {
    const date = `${bucket.date.slice(0, 7)}-01`
    const key = `${date}:${bucket.metric}:${bucket.category}`
    const monthlyBucket = monthlyBuckets.get(key)
    if (monthlyBucket) {
      monthlyBucket.count += bucket.count
      continue
    }
    monthlyBuckets.set(key, { ...bucket, date })
  }
  return [...monthlyBuckets.values()].sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      left.metric.localeCompare(right.metric) ||
      left.category.localeCompare(right.category),
  )
}

export function roundModerationTransparencyCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) return 0
  return (
    Math.round(value / MODERATION_TRANSPARENCY_ROUNDING_INCREMENT) *
    MODERATION_TRANSPARENCY_ROUNDING_INCREMENT
  )
}
