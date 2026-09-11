export const QUEUE_NAME = 'entity-listeners'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100
export const DEFAULT_RECONCILIATION_INTERVAL_SECONDS = 3600
export const POST_CATEGORY_FINALIZATION_RECONCILIATION_DEDUPLICATION_ID =
  'entity-listeners:reconcile-post-category-finalizations'
export const POST_CATEGORY_FINALIZATION_RECONCILIATION_DEDUPLICATION_TTL_MS = 60_000
export const ENTITY_LISTENER_ORDERING = {
  post_category_finalization_reconciliation: {
    key: 'post-category-finalization-reconciliation',
    concurrency: 1,
  },
} as const

export function getEntityListenerReconciliationIntervalSeconds(): number {
  const raw = process.env.ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS
  if (!raw) return DEFAULT_RECONCILIATION_INTERVAL_SECONDS
  const seconds = Number(raw)
  if (!Number.isInteger(seconds) || seconds < 300 || seconds > 86_400 || seconds % 60 !== 0) {
    throw new Error(
      'ENTITY_LISTENER_RECONCILIATION_INTERVAL_SECONDS must be a multiple of 60 from 300 to 86400',
    )
  }
  return seconds
}
