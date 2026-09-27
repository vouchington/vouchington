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

  return (ids: string[], priority?: number): EnqueueReturnType =>
    enqueue(ids, {
      priority: priority ?? PRIORITY_DEFAULT,
    } satisfies Partial<JobOptions>)
}

export const enqueueBulkRefreshTopicMetricsById = makeEnqueueBulkRefresh(
  'processRefreshTopicMetrics',
)
export const enqueueBulkRefreshPostMetricsById = makeEnqueueBulkRefresh('processRefreshPostMetrics')
export const enqueueBulkRefreshUserMetricsById = makeEnqueueBulkRefresh('processRefreshUserMetrics')
