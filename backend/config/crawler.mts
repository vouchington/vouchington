export const CRAWLER_USER_AGENT = 'voucha-bot https://voucha.ai/article/voucha-bot'

// Keep in sync with the voucha-crawls S3 lifecycle rule in vouchington-infra/opentofu/s3.tf.
export const CRAWL_HTML_SNAPSHOT_RETENTION_DAYS = 7

// A crawl's UUIDv7 id is minted when it starts and completed_at is set when it ends. Unfinished
// crawls become cleanup-eligible once older than the cleanup age, whose hard max is this value (the dynamic
// config cannot exceed it; services/crawls/work-limits.mts derives crawlCleanupMaxValues.ageDays
// from it). Candidate searches floor c.id this far before their completed_at cutoff to prune
// partitions. This is not an execution deadline: cleanup outages or delayed completion can
// outlive it and omit a sample from the best-effort boilerplate heuristic.
export const CRAWL_CLEANUP_MAX_AGE_DAYS = 30
