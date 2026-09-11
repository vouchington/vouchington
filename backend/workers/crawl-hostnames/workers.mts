import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { CRAWL_HOSTNAMES_QUEUE_NAME } from '@queues/crawl-hostnames/config'
import { processCrawlHostnamesJob } from './processors.mts'
import { Worker } from 'glide-mq'

export const crawlHostnames = new Worker(CRAWL_HOSTNAMES_QUEUE_NAME, processCrawlHostnamesJob, {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('crawlHostnames', { baseline: 5 }),
})
