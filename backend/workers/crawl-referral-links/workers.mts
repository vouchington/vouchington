import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { CRAWL_REFERRAL_LINKS_QUEUE_NAME } from '@queues/crawl-referral-links/config'
import { Worker } from 'glide-mq'
import { processCrawlReferralLinksJob } from './processors.mts'

export const crawlReferralLinks = new Worker(
  CRAWL_REFERRAL_LINKS_QUEUE_NAME,
  processCrawlReferralLinksJob,
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('crawlReferralLinks', { baseline: 5 }),
  },
)
