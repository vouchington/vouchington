import { entityOrderingKey } from '@queues/background/enqueues/define-job'

/** A feed's crawl tier maps to the job priority it is enqueued with; tier 1 runs first. */
export const TIER_PRIORITY: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 12,
  5: 20,
}

// Namespaced so no other domain shares the lane: one dispatcher at a time, outside the domain group
// of five fetches.
export const RSS_FEEDS_ORDERING = {
  dispatcher: { key: entityOrderingKey('rss-feeds', 'dispatcher'), concurrency: 1 },
} as const
