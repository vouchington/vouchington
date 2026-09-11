export const CRAWL_EMBEDS_QUEUE_NAME = 'crawl_embeds'

export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100
export const OEMBED_HOST_RATE_LIMIT_MS = 1_000
export const BACKFILL_DEDUPLICATION_TTL_MS = 3_600_000

export const CRAWL_EMBEDS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const
