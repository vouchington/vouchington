import type { JobOptions } from 'glide-mq'

export const QUEUE_NAME = 'bluesky-follow-propagation'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_BACKFILL = 100

// Debounce delay-reset window for reconcileFollow: collapses a rapid follow/unfollow toggle for
// the same pair into a single job that reads final state once the pair settles, instead of
// running reconcileBlueskyFollow once per intermediate click.
export const RECONCILE_FOLLOW_DEDUPLICATION_TTL_MS = 5_000
export const BACKFILL_DEDUPLICATION_TTL_MS = 3_600_000

export const BLUESKY_FOLLOW_PROPAGATION_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} satisfies Partial<JobOptions>
