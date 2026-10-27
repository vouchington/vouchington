import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  SITEMAPS_FAMILY_JOB,
  SITEMAPS_POST_DAY_JOB,
} from '@queues/background/enqueues/sitemaps-jobs'
import { SITEMAPS_ORDERING } from '@queues/background/enqueues/sitemaps-ordering'
import { getSitemapsOrderingKeyForDay } from '../config.mts'
import type { PostDayJobData } from '../types.mts'

const enqueueBulkUpdatePostDaySitemapJobs = createBackgroundBulkEnqueue(
  SITEMAPS_POST_DAY_JOB,
  (data: PostDayJobData) => ({
    data,
    opts: { ordering: SITEMAPS_ORDERING[getSitemapsOrderingKeyForDay(data.day)] },
  }),
)
const enqueueUpdateFamilySitemapJob = createBackgroundEnqueue(SITEMAPS_FAMILY_JOB)

/** One bulk admission, without throttle deduplication, for captured publication days. */
export async function enqueueBulkUpdatePostDaySitemapsForReconciliation(
  targets: PostDayJobData[],
): Promise<void> {
  if (targets.length === 0) return
  const jobs = await enqueueBulkUpdatePostDaySitemapJobs(targets)
  if (jobs.length !== targets.length || jobs.some(job => !job))
    throw new Error('Publication reconciliation sitemap jobs were not all accepted')
}

/** Every acknowledged review repair needs an accepted landing-pages rebuild, including retries. */
export async function enqueueUpdateLandingPagesSitemapForReconciliation(): Promise<void> {
  const job = await enqueueUpdateFamilySitemapJob(
    { family: 'landing-pages' },
    { ordering: SITEMAPS_ORDERING.indexes },
  )
  if (!job) throw new Error('Publication reconciliation landing-pages sitemap job was not accepted')
}
