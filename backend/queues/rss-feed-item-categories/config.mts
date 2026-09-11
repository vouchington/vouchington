export const QUEUE_NAME = 'rss-feed-item-categories'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_RECOVERY = 100
export const CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_ID =
  'rss-feed-item-categories:reconcile-snapshots'
export const CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_TTL_MS = 60_000
export const RSS_FEED_ITEM_CATEGORY_ORDERING = {
  snapshot_reconciliation: { key: 'snapshot-reconciliation', concurrency: 1 },
} as const
