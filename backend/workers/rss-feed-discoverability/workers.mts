import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { Worker, type Job } from 'glide-mq'
import { RSS_FEED_DISCOVERABILITY_QUEUE_NAME } from '@queues/rss-feed-discoverability/config'
import { evaluateRssFeedDiscoverability } from '@services/rss-feeds/evaluate-discoverability'
import type { RssFeedDiscoverabilityJobData } from '@queues/rss-feed-discoverability/types'

export const rssFeedDiscoverability = new Worker(
  RSS_FEED_DISCOVERABILITY_QUEUE_NAME,
  (job: Job) => {
    const jobName = job.name as RssFeedDiscoverabilityJobData['name']
    switch (jobName) {
      case 'processEvaluateRssFeedDiscoverability': {
        const rssFeedId = job.data?.rssFeedId
        if (typeof rssFeedId !== 'string' || !rssFeedId)
          throw new Error('RSS feed discoverability job .rssFeedId is required')
        return evaluateRssFeedDiscoverability(rssFeedId)
      }
      default: {
        const exhaustiveCheck: never = jobName
        throw new Error(`RSS feed discoverability job ${exhaustiveCheck} not found`)
      }
    }
  },
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('rssFeedDiscoverability', { baseline: 5 }),
  },
)
