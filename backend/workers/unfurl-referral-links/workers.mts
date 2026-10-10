import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { UNFURL_REFERRAL_LINKS_QUEUE_NAME } from '@queues/unfurl-referral-links/config'
import { processUnfurlReferralLinksJob } from './processors.mts'

export const unfurlReferralLinks = createWorker(
  UNFURL_REFERRAL_LINKS_QUEUE_NAME,
  processUnfurlReferralLinksJob,
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('unfurlReferralLinks', { baseline: 5 }),
  },
)
