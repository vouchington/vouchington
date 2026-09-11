import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  RSS_FEED_DISCOVERABILITY_DEFAULTS,
  RSS_FEED_DISCOVERABILITY_QUEUE_NAME,
} from './config.mts'
import { rssFeedDiscoverability } from './queues.mts'
import type { RssFeedDiscoverabilityJobs } from './types.mts'

const JOB_NAME: RssFeedDiscoverabilityJobs = 'processEvaluateRssFeedDiscoverability'

const enqueueBulkEvaluateJobs = createBulkEnqueueFunction<
  string,
  { rssFeedId: string },
  RssFeedDiscoverabilityJobs
>({
  queue: rssFeedDiscoverability,
  queueName: RSS_FEED_DISCOVERABILITY_QUEUE_NAME,
  jobName: JOB_NAME,
  buildJob: rssFeedId => ({
    data: { rssFeedId },
    opts: {
      attempts: RSS_FEED_DISCOVERABILITY_DEFAULTS.attempts,
      backoff: RSS_FEED_DISCOVERABILITY_DEFAULTS.backoff,
      removeOnComplete: RSS_FEED_DISCOVERABILITY_DEFAULTS.removeOnComplete,
      removeOnFail: RSS_FEED_DISCOVERABILITY_DEFAULTS.removeOnFail,
      deduplication: {
        id: `${JOB_NAME}__${rssFeedId}`,
        mode: 'debounce' as const,
        ttl: RSS_FEED_DISCOVERABILITY_DEFAULTS.deduplicationTtl,
      },
    },
  }),
})

export function enqueueBulkEvaluateRssFeedDiscoverability(
  rssFeedIds: string[],
  priority?: number,
): EnqueueReturnType {
  if (rssFeedIds.length === 0) return
  return enqueueBulkEvaluateJobs(Array.from(new Set(rssFeedIds)), {
    priority: priority ?? RSS_FEED_DISCOVERABILITY_DEFAULTS.priority,
  } satisfies Partial<JobOptions>)
}

export function enqueueEvaluateRssFeedDiscoverability(rssFeedId: string): EnqueueReturnType {
  return enqueueBulkEvaluateRssFeedDiscoverability([rssFeedId])
}
