import type { JobOptions } from 'glide-mq'

export const QUEUE_NAME = 'follower-distributions'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_BACKFILL = 100
export const FOLLOWER_DISTRIBUTION_BACKFILL_DEDUPLICATION_TTL_MS = 3_600_000

export const FOLLOWER_DISTRIBUTIONS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} satisfies Partial<JobOptions>

export const FOLLOWER_DISTRIBUTIONS_BACKFILL_DEFAULTS = {
  ...FOLLOWER_DISTRIBUTIONS_DEFAULTS,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
} satisfies Partial<JobOptions>
