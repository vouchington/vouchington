import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { processRssFeedsJob } from './processors.mts'
import { QUEUE_NAME } from '@queues/rss-feeds/config'
import { Worker } from 'glide-mq'

export const rss_feeds = new Worker(QUEUE_NAME, processRssFeedsJob, {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('rssFeeds', { baseline: 5 }),
})
