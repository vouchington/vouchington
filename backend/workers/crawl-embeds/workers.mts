import { createWorker, type NamedQueueJob } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { CRAWL_EMBEDS_QUEUE_NAME } from '@queues/crawl-embeds/config'
import type { CrawlEmbedsJobPayloads } from '@queues/crawl-embeds/types'
import { processCrawlEmbedsJob } from './processors.mts'

export const crawlEmbeds = createWorker<unknown, unknown, NamedQueueJob<CrawlEmbedsJobPayloads>>(
  CRAWL_EMBEDS_QUEUE_NAME,
  processCrawlEmbedsJob,
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('crawlEmbeds', { baseline: 5 }),
  },
)
