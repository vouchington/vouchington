import { pagedDispatchBackoffStrategies } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/crawl-dispatch/config'
import { processCrawlDispatchJob } from './processors.mts'

export const crawlDispatch = createWorker(QUEUE_NAME, processCrawlDispatchJob, {
  dedicatedCommandClient: true,
  backoffStrategies: pagedDispatchBackoffStrategies(),
  maxStalledCount: 1000000,
  concurrency: getWorkerConcurrency('crawlDispatch', { baseline: 8 }),
})
