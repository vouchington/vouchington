import { entityOrderingKey } from '@queues/background/enqueues/define-job'

// Namespaced singleton lanes outside the domain group of five source syncs: one dispatcher at a
// time and one cache-invalidation drain at a time.
export const URLS_DOMAINS_BLACKLIST_ORDERING = {
  dispatcher: { key: entityOrderingKey('urls-domains-blacklist', 'dispatcher') },
  cacheInvalidation: {
    key: entityOrderingKey('urls-domains-blacklist', 'cache-invalidation'),
  },
} as const
