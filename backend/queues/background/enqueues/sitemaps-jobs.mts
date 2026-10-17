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

const taskJob = <TData,>(name: string) =>
  defineBackgroundJob<TData>(SITEMAPS_DOMAIN, { name, priority: PRIORITY_TASK, ...DEFAULTS })
const dispatchJob = <TData = Record<string, never>,>(name: string) =>
  defineBackgroundJob<TData>(SITEMAPS_DOMAIN, { name, priority: PRIORITY_DISPATCH, ...DEFAULTS })

export const SITEMAPS_POST_DAY_JOB = taskJob<SitemapPostDayData>('processUpdatePostDaySitemap')
export const SITEMAPS_POST_TYPE_INDEX_JOB = taskJob<{ postType: PostType }>(
  'processUpdatePostTypeIndex',
)
export const SITEMAPS_POSTS_INDEX_JOB = taskJob<Record<string, never>>('processUpdatePostsIndex')
export const SITEMAPS_FAMILY_JOB = taskJob<{ family: string }>('processUpdateFamilySitemap')
export const SITEMAPS_ROOT_INDEX_JOB = taskJob<Record<string, never>>('processUpdateRootIndex')
export const SITEMAPS_NIGHTLY_BACKFILL_JOB = dispatchJob('processNightlyBackfillWeekDispatcher')
export const SITEMAPS_WEEKLY_BACKFILL_JOB = dispatchJob('processWeeklyBackfillMonthDispatcher')
export const SITEMAPS_MONTHLY_BACKFILL_JOB = dispatchJob<SitemapArchiveBackfillData>(
  'processMonthlyBackfillArchiveDispatcher',
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
