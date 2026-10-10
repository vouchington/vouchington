import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { CRAWL_URLS_QUEUE_NAME } from '@queues/crawler/config'
import { processCrawlerJob } from './processors.mts'

/* v8 ignore next -- Worker wiring is covered through the exported processCrawlerJob integration tests. */
export const crawlUrls = createWorker(CRAWL_URLS_QUEUE_NAME, processCrawlerJob, {
  dedicatedCommandClient: true,
  concurrency: getWorkerConcurrency('crawlUrls', { baseline: 5 }),
  lockDuration: 120_000,
  stalledInterval: 30_000,
})
