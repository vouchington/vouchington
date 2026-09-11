import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/entity-metrics-cache-refresh/config'
import type { EntityMetricsCacheRefreshJobs } from '@queues/entity-metrics-cache-refresh/types'
import { Worker, type Job } from 'glide-mq'
import { refresh } from '@services/entity-fetch/refresh'
import { refreshUserMetricsCache } from '@services/entity-fetch/metrics'

export const entityMetricsCacheRefresh = new Worker(
  QUEUE_NAME,
  (job: Job) => {
    const jobName = job.name as EntityMetricsCacheRefreshJobs

    switch (jobName) {
      case 'processRefreshTopicMetrics':
        return refresh.topic_metrics(job.data.id)
      case 'processRefreshPostMetrics':
        return refresh.post_metrics(job.data.id)
      case 'processRefreshUserMetrics':
        return refreshUserMetricsCache(job.data.id)
      default: {
        const exhaustiveCheck: never = jobName
        throw new Error(`Entity metrics cache refresh job ${exhaustiveCheck} not found`)
      }
    }
  },
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('entityMetricsCacheRefresh', { baseline: 5 }),
  },
)
