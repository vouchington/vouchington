export const QUEUE_NAME = 'article-sync'
export const PRIORITY_DEFAULT = 10
// 5-minute throttle window — rate-limits re-triggers after completion
export const ARTICLE_SYNC_DEDUP_TTL_MS = 5 * 60 * 1000
