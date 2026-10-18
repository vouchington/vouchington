import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The old queue's cap was its worker concurrency of 5, and every job ran in one of four singleton
// lanes (today's post-day sitemaps, past post-day sitemaps, the index sitemaps, and the backfill
// dispatchers), so at most 4 ran at once. The lanes are namespaced at enqueue time and each
// serializes writes to one set of sitemap files, so the group is `lanes` and the cap is their sum.
// Every job must name a lane.
export const SITEMAPS_DOMAIN = defineBackgroundDomain({
  domain: 'sitemaps',
  group: { kind: 'lanes', cap: 4 },
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
  ...DEFAULTS,
})
export const SITEMAPS_POST_TYPE_INDEX_JOB = defineBackgroundJob<{ postType: PostType }>(
  SITEMAPS_DOMAIN,
  { name: 'processUpdatePostTypeIndex', priority: PRIORITY_TASK, ...DEFAULTS },
)
export const SITEMAPS_POSTS_INDEX_JOB = defineBackgroundJob<Record<string, never>>(
  SITEMAPS_DOMAIN,
  {
    name: 'processUpdatePostsIndex',
    priority: PRIORITY_TASK,
    ...DEFAULTS,
  },
)
export const SITEMAPS_FAMILY_JOB = defineBackgroundJob<{ family: string }>(SITEMAPS_DOMAIN, {
  name: 'processUpdateFamilySitemap',
  priority: PRIORITY_TASK,
  ...DEFAULTS,
})
export const SITEMAPS_ROOT_INDEX_JOB = defineBackgroundJob<Record<string, never>>(SITEMAPS_DOMAIN, {
  name: 'processUpdateRootIndex',
  priority: PRIORITY_TASK,
  ...DEFAULTS,
})
export const SITEMAPS_NIGHTLY_BACKFILL_JOB = defineBackgroundJob<Record<string, never>>(
  SITEMAPS_DOMAIN,
  { name: 'processNightlyBackfillWeekDispatcher', priority: PRIORITY_DISPATCH, ...DEFAULTS },
)
export const SITEMAPS_WEEKLY_BACKFILL_JOB = defineBackgroundJob<Record<string, never>>(
  SITEMAPS_DOMAIN,
  { name: 'processWeeklyBackfillMonthDispatcher', priority: PRIORITY_DISPATCH, ...DEFAULTS },
)
export const SITEMAPS_MONTHLY_BACKFILL_JOB = defineBackgroundJob<SitemapArchiveBackfillData>(
  SITEMAPS_DOMAIN,
  { name: 'processMonthlyBackfillArchiveDispatcher', priority: PRIORITY_DISPATCH, ...DEFAULTS },
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
