export const QUEUE_NAME = 'story-post-related-url-projections'
export const PRIORITY_RECOVERY = 100
export const RECOVERY_DEDUPLICATION_ID = 'story-post-related-url-projections:reconcile'
export const RECOVERY_DEDUPLICATION_TTL_MS = 60_000
export const STORY_POST_RELATED_URL_PROJECTION_ORDERING = {
  reconciliation: { key: 'story-post-related-url-projections', concurrency: 1 },
} as const
