import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import { RSS_FEEDS_ORDERING } from './config.mts'

/**
 * `dispatch` (the default) is the dispatcher's backlog key. `request` is for a fetch someone asked
 * for now (user refresh, redirect target, new feed): it must not be swallowed by a queued
 * low-priority backlog job, and repeats of it still collapse while one is queued.
 */
type FetchRssFeedDeduplicationScope = 'dispatch' | 'request'

type FetchRssFeedInput = {
  rssFeedId: string
  ttl?: number
  skipDeduplication?: boolean
  deduplicationScope?: FetchRssFeedDeduplicationScope
}

const buildRssFeedJobId = (
  rssFeedId: string,
  scope: FetchRssFeedDeduplicationScope = 'dispatch',
) => (scope === 'request' ? `rss-feed-request__${rssFeedId}` : `rss-feed__${rssFeedId}`)

const enqueueBulkFetchRssFeedJobs = createBackgroundBulkEnqueue(
  RSS_FEEDS_FETCH_JOB,
  (data: FetchRssFeedInput) => ({
    data: { rssFeedId: data.rssFeedId, ttl: data.ttl },
    opts: {
      // `simple` dedup skips a feed while its fetch job is waiting, active, or retrying and admits
      // it again once that job completes or fails, so a backlogged feed is queued once, not once
      // per dispatch tick. The SLA flows to the worker as job.data.ttl and is enforced separately
      // by the worker's last_fetched_at staleness check (getRssFeedByIdToFetch with job.data.ttl).
      // A failed due crawl never updates last_fetched_at, so the next dispatch tick re-adds it
      // once its job has failed. A requested fetch keeps its own key so a low-priority backlog job
      // never swallows it; repeated requests still collapse while one is queued.
      ...(data.skipDeduplication
        ? {}
        : {
            deduplication: {
              id: buildRssFeedJobId(data.rssFeedId, data.deduplicationScope),
              mode: 'simple' as const,
            },
          }),
    },
  }),
)

const enqueueDispatchRssFeedsJob = createBackgroundEnqueue(RSS_FEEDS_DISPATCH_JOB)

export const enqueueBulkFetchRssFeeds = (
  rssFeedIds: string[],
  opts?: {
    ttl?: number
    priority?: number
    skipDeduplication?: boolean
    deduplicationScope?: FetchRssFeedDeduplicationScope
  },
): EnqueueReturnType => {
  const { ttl, priority, skipDeduplication, deduplicationScope } = opts ?? {}
  return enqueueBulkFetchRssFeedJobs(
    rssFeedIds.map(rssFeedId => ({ rssFeedId, ttl, skipDeduplication, deduplicationScope })),
    priority === undefined ? {} : { priority },
  )
}

export function enqueueDispatchRssFeeds(): EnqueueReturnType {
  return enqueueDispatchRssFeedsJob({}, { ordering: RSS_FEEDS_ORDERING.dispatcher })
}
