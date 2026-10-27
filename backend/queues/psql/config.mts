import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import type { JobOptions } from 'glide-mq'

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
export const PLATFORM_STATS_VIEW = 'mv_platform_stats'
export const TRENDING_RSS_FEEDS_VIEW = 'mv_trending_rss_feeds'
export const REVENUE_MEMBERSHIPS_VIEW = 'mv_revenue_memberships'
export const REVENUE_CHANGES_VIEW = 'mv_revenue_changes'

// Scheduler IDs
export const CREATE_PARTITIONS_SCHEDULER_ID = 'create-partitions-monthly'
export const CLEANUP_PARTITIONS_SCHEDULER_ID = 'cleanup-partitions-daily'
export const DATA_RETENTION_SCHEDULER_ID = 'data-retention-cleanup-daily'
export const REFRESH_RSS_FEED_CRAWL_TIERS_SCHEDULER_ID = 'refresh-rss-feed-crawl-tiers'
export const REFRESH_TOP_HASHTAGS_SCHEDULER_ID = 'refresh-top-hashtags'
export const REFRESH_PLATFORM_STATS_SCHEDULER_ID = 'refresh-platform-stats'
export const REFRESH_TRENDING_RSS_FEEDS_SCHEDULER_ID = 'refresh-trending-rss-feeds'
export const REFRESH_REVENUE_MEMBERSHIPS_SCHEDULER_ID = 'refresh-revenue-memberships'
export const REFRESH_REVENUE_CHANGES_SCHEDULER_ID = 'refresh-revenue-changes'
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
// Hourly safety-net refresh. Content changes enqueue the same view with a debounce.
export const REFRESH_TOP_HASHTAGS_CRON = '0 * * * *'
// Stagger the four refreshes across five-minute cycles to avoid the shared advisory lock.
export const REFRESH_PLATFORM_STATS_CRON = '0,5,10,15,20,25,30,35,40,45,50,55 * * * *'
export const REFRESH_TRENDING_RSS_FEEDS_CRON = '1,6,11,16,21,26,31,36,41,46,51,56 * * * *'
export const REFRESH_REVENUE_MEMBERSHIPS_CRON = '2,7,12,17,22,27,32,37,42,47,52,57 * * * *'
export const REFRESH_REVENUE_CHANGES_CRON = '3,8,13,18,23,28,33,38,43,48,53,58 * * * *'
// Daily at 6:00 AM UTC
export const RECONCILE_VOTE_DRIFT_CRON = '0 6 * * *'

export const MODERATION_RETENTION_JOB_NAME = 'moderationRetentionCleanup'
export const MODERATION_RETENTION_SCHEDULER_ID = 'moderation-retention-cleanup-daily'

export const moderationRetentionQueueConfig = new DynamicConfig({
  key: 'psql-moderation-retention-config',
  fieldTypes: { concurrency: 'number' },
  defaultFields: { concurrency: 1 },
})

export function getModerationRetentionJobOptions(): JobOptions {
  return {
    priority: PRIORITY_DEFAULT,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
    ordering: {
      key: 'psql:moderation-retention',
      concurrency: getBoundedPositiveIntegerField(moderationRetentionQueueConfig, 'concurrency', {
        defaultValue: 1,
        maxValue: 1,
      }),
    },
  }
}
