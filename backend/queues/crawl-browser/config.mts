export const CRAWL_BROWSER_QUEUE_NAME = 'crawl_browser'
export const PRIORITY_DEFAULT = 10

export const CRAWL_BROWSER_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}
