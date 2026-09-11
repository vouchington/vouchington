export const QUEUE_NAME = 'rss-feeds'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100

export const TIER_PRIORITY: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 12,
  5: 20,
}

export const RSS_FEEDS_ORDERING = {
  dispatcher: { key: 'dispatcher', concurrency: 1 },
  fetch: { key: 'fetch', concurrency: 5 },
} as const

export const RSS_FEEDS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 60_000,
}
