import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  type SitemapArchiveBackfillData,
  SITEMAPS_FAMILY_JOB,
  SITEMAPS_MONTHLY_BACKFILL_JOB,
  SITEMAPS_NIGHTLY_BACKFILL_JOB,
  SITEMAPS_POSTS_INDEX_JOB,
  SITEMAPS_POST_DAY_JOB,
  SITEMAPS_POST_TYPE_INDEX_JOB,
  SITEMAPS_ROOT_INDEX_JOB,
  SITEMAPS_WEEKLY_BACKFILL_JOB,
} from '@queues/background/enqueues/sitemaps-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import { SITEMAPS_ORDERING } from '@queues/background/enqueues/sitemaps-ordering'
import type { SitemapPostType } from '@services/sitemaps/types'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { getSitemapsOrderingKeyForDay, SITEMAPS_DEDUPLICATION_TTL_MS } from './config.mts'
import type { PostDayJobData, SitemapFamilyJobData } from './types.mts'

type SitemapDispatcherOptions = {
  deduplicationId?: string
}
const BACKFILL_DEDUPLICATION_TTL_MS = 60 * 60_000

const enqueueBulkUpdatePostDaySitemapJobs = createBackgroundBulkEnqueue(
  SITEMAPS_POST_DAY_JOB,
  (entry: PostDayJobData) => ({ data: entry, opts: postDayJobOptions(entry) }),
)

const enqueueUpdatePostTypeIndexJob = createBackgroundEnqueue(SITEMAPS_POST_TYPE_INDEX_JOB)
const enqueueUpdatePostsIndexJob = createBackgroundEnqueue(SITEMAPS_POSTS_INDEX_JOB)
const enqueueUpdateFamilySitemapJob = createBackgroundEnqueue(SITEMAPS_FAMILY_JOB)
const enqueueUpdateRootIndexJob = createBackgroundEnqueue(SITEMAPS_ROOT_INDEX_JOB)

function postDayJobOptions(entry: PostDayJobData): Partial<JobOptions> {
  return {
    ordering: SITEMAPS_ORDERING[getSitemapsOrderingKeyForDay(entry.day)],
    deduplication: {
      id: `post-day__${entry.postType}__${entry.day}`,
      mode: 'throttle' as const,
      ttl: SITEMAPS_DEDUPLICATION_TTL_MS,
    },
  }
}

function indexOptions(deduplicationId: string, priority?: number): Partial<JobOptions> {
  return {
    ...(priority === undefined ? {} : { priority }),
    ordering: SITEMAPS_ORDERING.indexes,
    deduplication: {
      id: deduplicationId,
      mode: 'throttle' as const,
      ttl: SITEMAPS_DEDUPLICATION_TTL_MS,
    },
  }
}

function createDispatcherEnqueue(
  job: BackgroundJobDefinition<Record<string, never> | SitemapArchiveBackfillData, false>,
) {
  const enqueue = createBackgroundEnqueue(job)

  return (options?: SitemapDispatcherOptions): EnqueueReturnType => {
    return enqueue(
      {},
      {
        ordering: SITEMAPS_ORDERING.dispatcher,
        ...(options?.deduplicationId && {
          deduplication: {
            id: options.deduplicationId,
            mode: 'throttle' as const,
            ttl: BACKFILL_DEDUPLICATION_TTL_MS,
          },
        }),
      },
    )
  }
}

export {
  enqueueUpdateLandingPagesSitemapForReconciliation,
  enqueueUpdatePostDaySitemapForReconciliation,
  enqueueBulkUpdatePostDaySitemapsForReconciliation,
} from './enqueues/post-publication.mts'

export const enqueueBulkUpdatePostDaySitemaps = (
  entries: Array<{ postType: SitemapPostType; day: string }>,
  priority?: number,
): EnqueueReturnType => {
  return enqueueBulkUpdatePostDaySitemapJobs(
    entries.map(entry => entry satisfies PostDayJobData),
    priority === undefined ? {} : { priority },
  )
}

export const enqueueUpdatePostTypeIndex = (
  postType: SitemapPostType,
  priority?: number,
): EnqueueReturnType => {
  return enqueueUpdatePostTypeIndexJob(
    { postType },
    indexOptions(`type-index__${postType}`, priority),
  )
}

export const enqueueUpdatePostsIndex = (priority?: number): EnqueueReturnType => {
  return enqueueUpdatePostsIndexJob({}, indexOptions('sitemaps:posts-index', priority))
}

export const enqueueUpdateFamilySitemap = (
  family: SitemapFamilyJobData['family'],
  priority?: number,
): EnqueueReturnType => {
  return enqueueUpdateFamilySitemapJob(
    { family },
    indexOptions(`family-index__${family}`, priority),
  )
}

export const enqueueUpdateRootIndex = (priority?: number): EnqueueReturnType => {
  return enqueueUpdateRootIndexJob({}, indexOptions('sitemaps:root-index', priority))
}

export const enqueueNightlyBackfillWeekDispatcher = createDispatcherEnqueue(
  SITEMAPS_NIGHTLY_BACKFILL_JOB,
)
export const enqueueWeeklyBackfillMonthDispatcher = createDispatcherEnqueue(
  SITEMAPS_WEEKLY_BACKFILL_JOB,
)
export const enqueueMonthlyBackfillArchiveDispatcher = createDispatcherEnqueue(
  SITEMAPS_MONTHLY_BACKFILL_JOB,
)

const enqueueMonthlyBackfillArchiveJob = createBackgroundEnqueue(SITEMAPS_MONTHLY_BACKFILL_JOB)

// The id names the cursor, so a retried page cannot enqueue a second continuation while one is
// queued, and a finished record releases the id.
/** Chains the next bounded page of the archive backfill from the last day of this one. */
export const enqueueMonthlyBackfillArchiveContinuation = (afterDay: string): EnqueueReturnType =>
  enqueueMonthlyBackfillArchiveJob(
    { afterDay },
    {
      jobId: `${SITEMAPS_MONTHLY_BACKFILL_JOB.name}__${afterDay}`,
      ordering: SITEMAPS_ORDERING.dispatcher,
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
