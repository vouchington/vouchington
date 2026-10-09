import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
  RSS_FEEDS_DEFAULTS,
  RSS_FEEDS_ORDERING,
} from './config.mts'
import { rss_feeds } from './queues.mts'
import type { RssFeedDispatcherJobs, RssFeedsJobs } from './types.mts'

type FetchRssFeedInput = {
  rssFeedId: string
  ttl?: number
  skipDeduplication?: boolean
}

type FetchRssFeedData = {
  rssFeedId: string
  ttl?: number
}

const defaults = {
  attempts: RSS_FEEDS_DEFAULTS.attempts,
  backoff: RSS_FEEDS_DEFAULTS.backoff,
  removeOnComplete: RSS_FEEDS_DEFAULTS.removeOnComplete,
  removeOnFail: RSS_FEEDS_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

const buildRssFeedJobId = (rssFeedId: string) => `rss-feed__${rssFeedId}`

const enqueueBulkFetchRssFeedJobs = createBulkEnqueueFunction<
  FetchRssFeedInput,
  FetchRssFeedData,
  RssFeedsJobs
>({
  queue: rss_feeds,
  queueName: QUEUE_NAME,
  jobName: 'fetchRssFeed',
  defaults,
  buildJob: data => ({
    data: { rssFeedId: data.rssFeedId, ttl: data.ttl },
    opts: {
      // `simple` dedup skips a feed while its fetch job is waiting, active, or retrying and admits
      // it again once that job completes or fails, so a backlogged feed is queued once, not once
      // per dispatch tick. The SLA flows to the worker as job.data.ttl and is enforced separately
      // by the worker's last_fetched_at staleness check (getRssFeedByIdToFetch with job.data.ttl).
      // A failed due crawl never updates last_fetched_at, so the next dispatch tick re-adds it
      // once its job has failed.
      ...(data.skipDeduplication
        ? {}
        : {
            deduplication: {
              id: buildRssFeedJobId(data.rssFeedId),
              mode: 'simple' as const,
            },
          }),
      ordering: RSS_FEEDS_ORDERING.fetch,
    },
  }),
})

const enqueueDispatchRssFeedsJob = createEnqueueFunction<
  Record<string, never>,
  RssFeedDispatcherJobs
>({
  queue: rss_feeds,
  queueName: QUEUE_NAME,
  jobName: 'dispatchRssFeeds',
  defaults,
})

export const enqueueBulkFetchRssFeeds = (
  rssFeedIds: string[],
  opts?: { ttl?: number; priority?: number; skipDeduplication?: boolean },
): EnqueueReturnType => {
  const { ttl, priority, skipDeduplication } = opts ?? {}
  return enqueueBulkFetchRssFeedJobs(
    rssFeedIds.map(rssFeedId => ({ rssFeedId, ttl, skipDeduplication })),
    { priority: priority ?? PRIORITY_DEFAULT },
  )
}

export function enqueueDispatchRssFeeds(): EnqueueReturnType {
  return enqueueDispatchRssFeedsJob(
    {},
    {
      priority: PRIORITY_DISPATCHER,
      ordering: RSS_FEEDS_ORDERING.dispatcher,
    },
  )
}
