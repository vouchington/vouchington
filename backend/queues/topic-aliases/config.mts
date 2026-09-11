export const QUEUE_NAME = 'topic-aliases'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_RECOVERY = 100
export const CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_ID =
  'topic-aliases:reconcile-category-mappings'
export const CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_TTL_MS = 60_000

export const TOPIC_ALIAS_ORDERING = {
  category_mapping_reconciliation: {
    key: 'category-mapping-reconciliation',
    concurrency: 1,
  },
  post_invalidation: {
    key: 'post-invalidation',
    concurrency: 1,
  },
} as const
