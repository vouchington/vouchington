export const QUEUE_NAME = 'find-your-friends'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100

export const ENQUEUE_BATCH_SIZE = 1000

export const FIND_YOUR_FRIENDS_ORDERING = {
  dispatcher: { key: 'dispatcher', concurrency: 1 },
  sync_facebook: { key: 'sync_facebook', concurrency: 5 },
  sync_x: { key: 'sync_x', concurrency: 2 }, // tight rate limits
  sync_github: { key: 'sync_github', concurrency: 5 },
} as const

export const FIND_YOUR_FRIENDS_RATE_LIMITS = {
  sync_facebook: { max: 5, duration: 1_000 }, // 5 req/s
  sync_x: { max: 1, duration: 2_000 }, // 1 req/2s (tight limits)
  sync_github: { max: 5, duration: 1_000 }, // 5 req/s
} as const

export const FIND_YOUR_FRIENDS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 5 * 60_000, // 5 minutes
}
