import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { CRAWL_EMBEDS_QUEUE_NAME } from '@queues/crawl-embeds/config'
import { Worker } from 'glide-mq'
import { processCrawlEmbedsJob } from './processors.mts'

export const crawlEmbeds = new Worker(CRAWL_EMBEDS_QUEUE_NAME, processCrawlEmbedsJob, {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('crawlEmbeds', { baseline: 5 }),
})
