export const QUEUE_NAME = 'rss-feed-maintenance'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_HARD_DELETE = 50
export const PRIORITY_RECOVERY = 100
export const CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_ID =
  'rss-feed-item-categories:reconcile-snapshots'
export const CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_TTL_MS = 60_000
export const RSS_FEED_ITEM_CATEGORY_ORDERING = {
  snapshot_reconciliation: { key: 'snapshot-reconciliation', concurrency: 1 },
} as const

export const CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_ID =
  'topic-aliases:reconcile-category-mappings'
export const CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_TTL_MS = 60_000
export const TOPIC_ALIAS_ORDERING = {
  category_mapping_reconciliation: { key: 'category-mapping-reconciliation', concurrency: 1 },
  post_invalidation: { key: 'post-invalidation', concurrency: 1 },
} as const

export const RSS_FEED_DISCOVERABILITY_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  priority: PRIORITY_DEFAULT,
  deduplicationTtl: 1000 * 60 * 5,
} as const
