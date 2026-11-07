export const CRAWLER_USER_AGENT = 'voucha-bot https://voucha.ai/article/voucha-bot'

// Keep in sync with the voucha-crawls S3 lifecycle rule in vouchington-infra/opentofu/s3.tf.
export const CRAWL_HTML_SNAPSHOT_RETENTION_DAYS = 7

// A crawl's UUIDv7 id is minted when it starts and completed_at is set when it ends. Unfinished
// crawls are purged once older than the cleanup age, whose hard max is this value (the dynamic
// config cannot exceed it; services/crawls/work-limits.mts derives crawlCleanupMaxValues.ageDays
// from it). Candidate searches floor c.id this far before their completed_at cutoff to prune
// partitions. Residual risk: only a crawl that outlives the hard max because cleanup lagged is
// missed, which drops one sample from a best-effort boilerplate heuristic and is harmless.
export const CRAWL_CLEANUP_MAX_AGE_DAYS = 365
