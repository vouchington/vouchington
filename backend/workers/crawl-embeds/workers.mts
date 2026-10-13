import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { CRAWL_EMBEDS_QUEUE_NAME } from '@queues/crawl-embeds/config'
import { processCrawlEmbedsJob } from './processors.mts'

export const crawlEmbeds = createWorker(CRAWL_EMBEDS_QUEUE_NAME, processCrawlEmbedsJob, {
  dedicatedCommandClient: true,
  concurrency: getWorkerConcurrency('crawlEmbeds', { baseline: 5 }),
})
