export const QUEUE_NAME = 'psql'
export const PRIORITY_DEFAULT = 10

// Job names
export const CREATE_PARTITIONS_JOB_NAME = 'createPartitions'
export const CLEANUP_PARTITIONS_JOB_NAME = 'cleanupPartitions'
export const DATA_RETENTION_JOB_NAME = 'dataRetentionCleanup'
export const REFRESH_MATERIALIZED_VIEW_JOB_NAME = 'refreshMaterializedView'
export const RECONCILE_VOTE_DRIFT_JOB_NAME = 'reconcileVoteDrift'

// Materialized view names refreshable via the refreshMaterializedView job
export const RSS_FEED_CRAWL_TIERS_VIEW = 'mv_rss_feed_crawl_tiers'
export const TOP_HASHTAGS_VIEW = 'mv_top_hashtags'

// Scheduler IDs
export const CREATE_PARTITIONS_SCHEDULER_ID = 'create-partitions-monthly'
export const CLEANUP_PARTITIONS_SCHEDULER_ID = 'cleanup-partitions-daily'
export const DATA_RETENTION_SCHEDULER_ID = 'data-retention-cleanup-daily'
export const REFRESH_RSS_FEED_CRAWL_TIERS_SCHEDULER_ID = 'refresh-rss-feed-crawl-tiers'
export const REFRESH_TOP_HASHTAGS_SCHEDULER_ID = 'refresh-top-hashtags'
export const RECONCILE_VOTE_DRIFT_SCHEDULER_ID = 'reconcile-vote-drift'

// Cron schedules
// Monthly on the 1st at 00:00 UTC
export const CREATE_PARTITIONS_CRON = '0 0 1 * *'
// Daily at 2:00 AM UTC
export const CLEANUP_PARTITIONS_CRON = '0 2 * * *'
// Daily at 4:00 AM UTC
export const DATA_RETENTION_CRON = '0 4 * * *'
// Daily at 1:00 AM UTC
export const REFRESH_RSS_FEED_CRAWL_TIERS_CRON = '0 1 * * *'
// Hourly safety-net refresh. Content changes enqueue the same view with a five-minute debounce.
export const REFRESH_TOP_HASHTAGS_CRON = '0 * * * *'
export const TOP_HASHTAGS_DEDUPLICATION_TTL_MS = 5 * 60_000
// Daily at 6:00 AM UTC
export const RECONCILE_VOTE_DRIFT_CRON = '0 6 * * *'
