export const QUEUE_NAME = 'post-publication'
export const PRIORITY_RECONCILIATION = 100
export const RECONCILIATION_DEDUPLICATION_ID = 'post-publication:reconcile'
export const RECONCILIATION_DEDUPLICATION_TTL_MS = 60_000
export const POST_PUBLICATION_ORDERING = {
  reconciliation: { key: 'publication-reconciliation', concurrency: 1 },
} as const
