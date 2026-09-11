export const QUEUE_NAME = 'user-rss-feed-imports'
export const PRIORITY_DEFAULT = 10

export const USER_RSS_FEED_IMPORTS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 60_000,
}
