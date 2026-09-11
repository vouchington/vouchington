export const QUEUE_NAME = 'urls-domains-blacklist'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100

export const URLS_DOMAINS_BLACKLIST_ORDERING = {
  dispatcher: { key: 'dispatcher', concurrency: 1 },
  sync: { key: 'sync', concurrency: 5 },
} as const

export const URLS_DOMAINS_BLACKLIST_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}
