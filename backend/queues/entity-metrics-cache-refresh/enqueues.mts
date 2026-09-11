import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { DEDUPLICATION_TTL_MS, PRIORITY_DEFAULT, QUEUE_NAME } from './config.mts'
import { entityMetricsCacheRefresh } from './queues.mts'
import type { EntityMetricsCacheRefreshJobs } from './types.mts'

function makeEnqueueBulkRefresh(processorName: EntityMetricsCacheRefreshJobs) {
  const enqueue = createBulkEnqueueFunction<string, { id: string }, EntityMetricsCacheRefreshJobs>({
    queue: entityMetricsCacheRefresh,
    queueName: QUEUE_NAME,
    jobName: processorName,
    buildJob: id => ({
      data: { id },
      opts: {
        deduplication: {
          id: `${processorName}__${id}`,
          mode: 'debounce' as const,
          ttl: DEDUPLICATION_TTL_MS,
        },
      },
    }),
  })

  const enqueueJobsWithPriority = (ids: string[], priority?: number) => {
    return enqueue(ids, {
      priority: priority ?? PRIORITY_DEFAULT,
    } satisfies Partial<JobOptions>)
  }

  return {
    enqueue: (ids: string[], priority?: number): EnqueueReturnType =>
      enqueueJobsWithPriority(ids, priority),
    enqueueAndWait: (ids: string[], priority?: number): Promise<void> =>
      enqueueJobsWithPriority(ids, priority).then(() => undefined),
  }
}

const topicMetricsRefresh = makeEnqueueBulkRefresh('processRefreshTopicMetrics')
export const enqueueBulkRefreshTopicMetricsById = topicMetricsRefresh.enqueue
export const enqueueBulkRefreshTopicMetricsByIdAndWait = topicMetricsRefresh.enqueueAndWait
const postMetricsRefresh = makeEnqueueBulkRefresh('processRefreshPostMetrics')
export const enqueueBulkRefreshPostMetricsById = postMetricsRefresh.enqueue
export const enqueueBulkRefreshPostMetricsByIdAndWait = postMetricsRefresh.enqueueAndWait
const userMetricsRefresh = makeEnqueueBulkRefresh('processRefreshUserMetrics')
export const enqueueBulkRefreshUserMetricsById = userMetricsRefresh.enqueue
export const enqueueBulkRefreshUserMetricsByIdAndWait = userMetricsRefresh.enqueueAndWait
