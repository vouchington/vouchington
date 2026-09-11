import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { psql } from '../queues.mts'
import {
  CREATE_PARTITIONS_JOB_NAME,
  CREATE_PARTITIONS_SCHEDULER_ID,
  CREATE_PARTITIONS_CRON,
  CLEANUP_PARTITIONS_JOB_NAME,
  CLEANUP_PARTITIONS_SCHEDULER_ID,
  CLEANUP_PARTITIONS_CRON,
  DATA_RETENTION_JOB_NAME,
  DATA_RETENTION_SCHEDULER_ID,
  DATA_RETENTION_CRON,
  REFRESH_MATERIALIZED_VIEW_JOB_NAME,
  REFRESH_RSS_FEED_CRAWL_TIERS_SCHEDULER_ID,
  REFRESH_RSS_FEED_CRAWL_TIERS_CRON,
  RSS_FEED_CRAWL_TIERS_VIEW,
  REFRESH_TOP_HASHTAGS_SCHEDULER_ID,
  REFRESH_TOP_HASHTAGS_CRON,
  TOP_HASHTAGS_VIEW,
  RECONCILE_VOTE_DRIFT_JOB_NAME,
  RECONCILE_VOTE_DRIFT_SCHEDULER_ID,
  RECONCILE_VOTE_DRIFT_CRON,
  PRIORITY_DEFAULT,
  QUEUE_NAME,
} from '../config.mts'
import {
  enqueueDataRetentionCleanup,
  enqueueReconcileVoteDrift,
  enqueueRefreshMaterializedView,
  enqueueRefreshTopHashtags,
} from '../enqueues.mts'

const SCHEDULE_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  priority: PRIORITY_DEFAULT,
} satisfies JobOptions

const TOP_HASHTAGS_SCHEDULE_OPTS = {
  ...SCHEDULE_OPTS,
  ordering: { key: 'mv_refresh', concurrency: 1 },
} satisfies JobOptions

const MATERIALIZED_VIEW_SCHEDULE_OPTS = {
  ...SCHEDULE_OPTS,
  ordering: { key: 'mv_refresh', concurrency: 1 },
} satisfies JobOptions

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: CREATE_PARTITIONS_SCHEDULER_ID,
    repeat: { pattern: CREATE_PARTITIONS_CRON },
    template: { name: CREATE_PARTITIONS_JOB_NAME, data: {}, opts: SCHEDULE_OPTS },
    operatorSurfaces: [{ kind: 'psql', jobType: 'createPartitions' }],
  },
  {
    schedulerId: REFRESH_TOP_HASHTAGS_SCHEDULER_ID,
    repeat: { pattern: REFRESH_TOP_HASHTAGS_CRON },
    template: {
      name: REFRESH_MATERIALIZED_VIEW_JOB_NAME,
      data: { viewName: TOP_HASHTAGS_VIEW },
      opts: TOP_HASHTAGS_SCHEDULE_OPTS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'refreshTopHashtags',
        schedule: REFRESH_TOP_HASHTAGS_CRON,
        description: 'Refresh top-hashtag materialized view (hourly)',
        trigger: enqueueRefreshTopHashtags,
      },
    ],
  },
  {
    schedulerId: CLEANUP_PARTITIONS_SCHEDULER_ID,
    repeat: { pattern: CLEANUP_PARTITIONS_CRON },
    template: { name: CLEANUP_PARTITIONS_JOB_NAME, data: {}, opts: SCHEDULE_OPTS },
    operatorSurfaces: [{ kind: 'psql', jobType: 'cleanupPartitions' }],
  },
  {
    schedulerId: REFRESH_RSS_FEED_CRAWL_TIERS_SCHEDULER_ID,
    repeat: { pattern: REFRESH_RSS_FEED_CRAWL_TIERS_CRON },
    template: {
      name: REFRESH_MATERIALIZED_VIEW_JOB_NAME,
      data: { viewName: RSS_FEED_CRAWL_TIERS_VIEW },
      opts: MATERIALIZED_VIEW_SCHEDULE_OPTS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'refreshRssFeedCrawlTiers',
        schedule: REFRESH_RSS_FEED_CRAWL_TIERS_CRON,
        description: 'Refresh RSS feed crawl-tier materialized view (nightly)',
        trigger: () => enqueueRefreshMaterializedView(RSS_FEED_CRAWL_TIERS_VIEW),
      },
    ],
  },
  {
    schedulerId: DATA_RETENTION_SCHEDULER_ID,
    repeat: { pattern: DATA_RETENTION_CRON },
    template: { name: DATA_RETENTION_JOB_NAME, data: {}, opts: SCHEDULE_OPTS },
    environment: 'production',
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: DATA_RETENTION_SCHEDULER_ID,
        schedule: `${DATA_RETENTION_CRON} (prod only)`,
        description: 'Enforce database and local analytics retention policies',
        trigger: enqueueDataRetentionCleanup,
      },
    ],
  },
  {
    schedulerId: RECONCILE_VOTE_DRIFT_SCHEDULER_ID,
    repeat: { pattern: RECONCILE_VOTE_DRIFT_CRON },
    template: { name: RECONCILE_VOTE_DRIFT_JOB_NAME, data: {}, opts: SCHEDULE_OPTS },
    // Runs everywhere (no `environment` restriction), including staging and developer laptops:
    // counter drift is caused by code paths that write the denormalized counter without writing
    // post_votes, and those land on staging first. Stopping it there would delete the
    // early-warning signal for exactly the bug class it exists to catch.
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: RECONCILE_VOTE_DRIFT_SCHEDULER_ID,
        schedule: RECONCILE_VOTE_DRIFT_CRON,
        description:
          'Reconcile denormalized post vote counters against the post_votes source of truth',
        trigger: enqueueReconcileVoteDrift,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(psql, scheduledJobManifest)
}
