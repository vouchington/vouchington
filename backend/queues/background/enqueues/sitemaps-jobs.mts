import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { SITEMAPS_ORDERING } from '../../sitemaps/config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Each lane serializes writes to one set of sitemap files. Post-day enqueues choose today's or
// past days' lane from the job data; the registry supplies today's lane as its base option.
export const SITEMAPS_DOMAIN = defineBackgroundDomain({
  domain: 'sitemaps',
  workerConcurrency: 5,
})

const DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

/** The archive dispatcher enqueues one page of days after `afterDay`, then continues from its last day. */
export type SitemapArchiveBackfillData = { afterDay?: string }

type PostType = string
export type SitemapPostDayData = { postType: PostType; day: string }

export const SITEMAPS_POST_DAY_JOB = defineBackgroundJob<SitemapPostDayData>(SITEMAPS_DOMAIN, {
  name: 'processUpdatePostDaySitemap',
  priority: PRIORITY_TASK,
  ordering: SITEMAPS_ORDERING.post_day_today,
  ...DEFAULTS,
})
export const SITEMAPS_POST_TYPE_INDEX_JOB = defineBackgroundJob<{ postType: PostType }>(
  SITEMAPS_DOMAIN,
  {
    name: 'processUpdatePostTypeIndex',
    priority: PRIORITY_TASK,
    ordering: SITEMAPS_ORDERING.indexes,
    ...DEFAULTS,
  },
)
export const SITEMAPS_POSTS_INDEX_JOB = defineBackgroundJob(SITEMAPS_DOMAIN, {
  name: 'processUpdatePostsIndex',
  priority: PRIORITY_TASK,
  ordering: SITEMAPS_ORDERING.indexes,
  ...DEFAULTS,
})
export const SITEMAPS_FAMILY_JOB = defineBackgroundJob<{ family: string }>(SITEMAPS_DOMAIN, {
  name: 'processUpdateFamilySitemap',
  priority: PRIORITY_TASK,
  ordering: SITEMAPS_ORDERING.indexes,
  ...DEFAULTS,
})
export const SITEMAPS_ROOT_INDEX_JOB = defineBackgroundJob(SITEMAPS_DOMAIN, {
  name: 'processUpdateRootIndex',
  priority: PRIORITY_TASK,
  ordering: SITEMAPS_ORDERING.indexes,
  ...DEFAULTS,
})
export const SITEMAPS_NIGHTLY_BACKFILL_JOB = defineBackgroundJob(SITEMAPS_DOMAIN, {
  name: 'processNightlyBackfillWeekDispatcher',
  priority: PRIORITY_DISPATCH,
  ordering: SITEMAPS_ORDERING.dispatcher,
  ...DEFAULTS,
})
export const SITEMAPS_WEEKLY_BACKFILL_JOB = defineBackgroundJob(SITEMAPS_DOMAIN, {
  name: 'processWeeklyBackfillMonthDispatcher',
  priority: PRIORITY_DISPATCH,
  ordering: SITEMAPS_ORDERING.dispatcher,
  ...DEFAULTS,
})
export const SITEMAPS_MONTHLY_BACKFILL_JOB = defineBackgroundJob<SitemapArchiveBackfillData>(
  SITEMAPS_DOMAIN,
  {
    name: 'processMonthlyBackfillArchiveDispatcher',
    priority: PRIORITY_DISPATCH,
    ordering: SITEMAPS_ORDERING.dispatcher,
    ...DEFAULTS,
  },
)

export const SITEMAPS_JOBS = [
  SITEMAPS_POST_DAY_JOB,
  SITEMAPS_POST_TYPE_INDEX_JOB,
  SITEMAPS_POSTS_INDEX_JOB,
  SITEMAPS_FAMILY_JOB,
  SITEMAPS_ROOT_INDEX_JOB,
  SITEMAPS_NIGHTLY_BACKFILL_JOB,
  SITEMAPS_WEEKLY_BACKFILL_JOB,
  SITEMAPS_MONTHLY_BACKFILL_JOB,
] as const
