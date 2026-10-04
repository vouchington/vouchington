export const CRAWL_REFERRAL_LINKS_QUEUE_NAME = 'crawl_referral_links'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100

export const CRAWL_REFERRAL_LINKS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 60_000,
}
