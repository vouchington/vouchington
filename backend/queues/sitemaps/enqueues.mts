import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { SitemapPostType } from '@services/sitemaps/types'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  getSitemapsOrderingKeyForDay,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
  SITEMAPS_DEDUPLICATION_TTL_MS,
  SITEMAPS_ORDERING,
} from './config.mts'
import { sitemaps } from './queues.mts'
import type {
  PostDayJobData,
  PostTypeIndexJobData,
  SitemapFamilyJobData,
  SitemapDispatcherJobs,
  SitemapIndexJobs,
  SitemapPostDayJobs,
} from './types.mts'

const POST_DAY_JOB_NAME: SitemapPostDayJobs = 'processUpdatePostDaySitemap'
type SitemapDispatcherOptions = {
  deduplicationId?: string
}
const BACKFILL_DEDUPLICATION_TTL_MS = 60 * 60_000

const enqueueBulkUpdatePostDaySitemapJobs = createBulkEnqueueFunction<
  PostDayJobData,
  PostDayJobData,
  SitemapPostDayJobs
>({
  queue: sitemaps,
  queueName: QUEUE_NAME,
  jobName: POST_DAY_JOB_NAME,
  buildJob: entry => ({
    data: entry,
    opts: postDayJobOptions(entry, PRIORITY_DEFAULT),
  }),
})

const enqueueUpdatePostTypeIndexJob = createEnqueueFunction<PostTypeIndexJobData, SitemapIndexJobs>(
  {
    queue: sitemaps,
    queueName: QUEUE_NAME,
    jobName: 'processUpdatePostTypeIndex',
  },
)

const enqueueUpdatePostsIndexJob = createEnqueueFunction<Record<string, never>, SitemapIndexJobs>({
  queue: sitemaps,
  queueName: QUEUE_NAME,
  jobName: 'processUpdatePostsIndex',
})

const enqueueUpdateFamilySitemapJob = createEnqueueFunction<SitemapFamilyJobData, SitemapIndexJobs>(
  {
    queue: sitemaps,
    queueName: QUEUE_NAME,
    jobName: 'processUpdateFamilySitemap',
  },
)

const enqueueUpdateRootIndexJob = createEnqueueFunction<Record<string, never>, SitemapIndexJobs>({
  queue: sitemaps,
  queueName: QUEUE_NAME,
  jobName: 'processUpdateRootIndex',
})

function postDayJobOptions(entry: PostDayJobData, priority: number): Partial<JobOptions> {
  return {
    priority,
    ordering: SITEMAPS_ORDERING[getSitemapsOrderingKeyForDay(entry.day)],
    deduplication: {
      id: `post-day__${entry.postType}__${entry.day}`,
      mode: 'throttle' as const,
      ttl: SITEMAPS_DEDUPLICATION_TTL_MS,
    },
  }
}

function postTypeIndexOptions(postType: SitemapPostType, priority: number): Partial<JobOptions> {
  return {
    priority,
    ordering: SITEMAPS_ORDERING.indexes,
    deduplication: {
      id: `type-index__${postType}`,
      mode: 'throttle' as const,
      ttl: SITEMAPS_DEDUPLICATION_TTL_MS,
    },
  }
}

function indexOptions(deduplicationId: string, priority: number): Partial<JobOptions> {
  return {
    priority,
    ordering: SITEMAPS_ORDERING.indexes,
    deduplication: {
      id: deduplicationId,
      mode: 'throttle' as const,
      ttl: SITEMAPS_DEDUPLICATION_TTL_MS,
    },
  }
}

function createDispatcherEnqueue(jobName: SitemapDispatcherJobs) {
  const enqueue = createEnqueueFunction<Record<string, never>, SitemapDispatcherJobs>({
    queue: sitemaps,
    queueName: QUEUE_NAME,
    jobName,
  })

  return (options?: SitemapDispatcherOptions): EnqueueReturnType => {
    return enqueue(
      {},
      {
        priority: PRIORITY_DISPATCHER,
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

export { enqueueUpdatePostDaySitemapForReconciliation } from './enqueues/post-publication.mts'

export const enqueueBulkUpdatePostDaySitemaps = (
  entries: Array<{ postType: SitemapPostType; day: string }>,
  priority = PRIORITY_DEFAULT,
): EnqueueReturnType => {
  return enqueueBulkUpdatePostDaySitemapJobs(
    entries.map(entry => entry satisfies PostDayJobData),
    { priority },
  )
}

export const enqueueUpdatePostTypeIndex = (
  postType: SitemapPostType,
  priority = PRIORITY_DEFAULT,
): EnqueueReturnType => {
  return enqueueUpdatePostTypeIndexJob({ postType }, postTypeIndexOptions(postType, priority))
}

export const enqueueUpdatePostsIndex = (priority = PRIORITY_DEFAULT): EnqueueReturnType => {
  return enqueueUpdatePostsIndexJob({}, indexOptions('posts-index', priority))
}

export const enqueueUpdateFamilySitemap = (
  family: SitemapFamilyJobData['family'],
  priority = PRIORITY_DEFAULT,
): EnqueueReturnType => {
  return enqueueUpdateFamilySitemapJob(
    { family },
    indexOptions(`family-index__${family}`, priority),
  )
}

export const enqueueUpdateRootIndex = (priority = PRIORITY_DEFAULT): EnqueueReturnType => {
  return enqueueUpdateRootIndexJob({}, indexOptions('root-index', priority))
}

export const enqueueNightlyBackfillWeekDispatcher = createDispatcherEnqueue(
  'processNightlyBackfillWeekDispatcher',
)
export const enqueueWeeklyBackfillMonthDispatcher = createDispatcherEnqueue(
  'processWeeklyBackfillMonthDispatcher',
)
export const enqueueMonthlyBackfillArchiveDispatcher = createDispatcherEnqueue(
  'processMonthlyBackfillArchiveDispatcher',
)
