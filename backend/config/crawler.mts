export const CRAWLER_USER_AGENT = 'voucha-bot https://voucha.ai/article/voucha-bot'

// Keep in sync with the voucha-crawls S3 lifecycle rule in vouchington-infra/opentofu/s3.tf.
export const CRAWL_HTML_SNAPSHOT_RETENTION_DAYS = 7

// A crawl's UUIDv7 id is minted when it starts and completed_at is set when it ends. Unfinished
// crawls are purged after the crawl cleanup age (default 30 days, services/crawls/work-limits.mts),
// so candidate searches floor c.id this far before their completed_at cutoff to prune partitions.
export const CRAWL_MAX_START_TO_COMPLETION_DAYS = 30
