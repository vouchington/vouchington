import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { CRAWL_HOSTNAMES_QUEUE_NAME } from '@queues/crawl-hostnames/config'
import { processCrawlHostnamesJob } from './processors.mts'

export const crawlHostnames = createWorker(CRAWL_HOSTNAMES_QUEUE_NAME, processCrawlHostnamesJob, {
  dedicatedCommandClient: true,
  concurrency: getWorkerConcurrency('crawlHostnames', { baseline: 5 }),
})
