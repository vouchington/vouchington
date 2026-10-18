import type { EnqueueReturnType } from '@voucha/types'
import { createBackgroundBulkEnqueue } from '@queues/background/enqueues'
import {
  VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB,
  VOTE_AGGREGATION_REFRESH_TOPIC_METRICS_JOB,
  VOTE_AGGREGATION_REFRESH_USER_METRICS_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'

function makeEnqueueBulkRefresh(
  job: typeof VOTE_AGGREGATION_REFRESH_TOPIC_METRICS_JOB,
  deduplicationPrefix: string,
) {
  const enqueue = createBackgroundBulkEnqueue(job, (id: string) => ({
    data: { id },
    opts: {
      deduplication: {
        id: `${deduplicationPrefix}__${id}`,
        mode: 'debounce' as const,
      },
    },
  }))

  return (ids: string[], priority?: number): EnqueueReturnType =>
    enqueue(ids, priority === undefined ? {} : { priority })
}

export const enqueueBulkRefreshTopicMetricsById = makeEnqueueBulkRefresh(
  VOTE_AGGREGATION_REFRESH_TOPIC_METRICS_JOB,
  'processRefreshTopicMetrics',
)
export const enqueueBulkRefreshPostMetricsById = makeEnqueueBulkRefresh(
  VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB,
  'processRefreshPostMetrics',
)
export const enqueueBulkRefreshUserMetricsById = makeEnqueueBulkRefresh(
  VOTE_AGGREGATION_REFRESH_USER_METRICS_JOB,
  'processRefreshUserMetrics',
)
