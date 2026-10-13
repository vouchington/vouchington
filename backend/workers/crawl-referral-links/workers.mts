import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { CRAWL_REFERRAL_LINKS_QUEUE_NAME } from '@queues/crawl-referral-links/config'
import { processCrawlReferralLinksJob } from './processors.mts'

export const crawlReferralLinks = createWorker(
  CRAWL_REFERRAL_LINKS_QUEUE_NAME,
  processCrawlReferralLinksJob,
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('crawlReferralLinks', { baseline: 5 }),
  },
)
