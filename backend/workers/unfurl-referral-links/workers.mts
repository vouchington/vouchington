import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { UNFURL_REFERRAL_LINKS_QUEUE_NAME } from '@queues/unfurl-referral-links/config'
import { Worker } from 'glide-mq'
import { processUnfurlReferralLinksJob } from './processors.mts'

export const unfurlReferralLinks = new Worker(
  UNFURL_REFERRAL_LINKS_QUEUE_NAME,
  processUnfurlReferralLinksJob,
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('unfurlReferralLinks', { baseline: 5 }),
  },
)
