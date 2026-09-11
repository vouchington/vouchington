export const RSS_FEED_DISCOVERABILITY_QUEUE_NAME = 'rss-feed-discoverability'
export const PRIORITY_DEFAULT = 10

export const RSS_FEED_DISCOVERABILITY_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  priority: PRIORITY_DEFAULT,
  deduplicationTtl: 1000 * 60 * 5,
} as const
