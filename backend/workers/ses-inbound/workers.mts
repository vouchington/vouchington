import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import {
  SES_INBOUND_PROCESS_JOB_NAME,
  SES_INBOUND_QUEUE_NAME,
  SES_INBOUND_RECONCILE_JOB_NAME,
  type SesInboundProcessJobData,
} from '@ts-shared/ses-inbound-contract'
import type { Job } from 'glide-mq'
import { processSesInboundEmail, reconcileSesInboundEmails } from './processors.mts'

export const sesInboundWorker = createWorker(
  SES_INBOUND_QUEUE_NAME,
  async (job: Job<SesInboundProcessJobData | Record<string, never>>) => {
    if (job.name === SES_INBOUND_PROCESS_JOB_NAME) {
      await processSesInboundEmail(job.data as SesInboundProcessJobData)
      return
    }
    if (job.name === SES_INBOUND_RECONCILE_JOB_NAME) {
      await reconcileSesInboundEmails()
      return
    }
    throw new Error(`Unknown SES inbound job: ${job.name}`)
  },
  { concurrency: getWorkerConcurrency('sesInbound', { baseline: 1, ignoreScale: true }) },
)
