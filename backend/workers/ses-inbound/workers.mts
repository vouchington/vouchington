import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  SES_INBOUND_PROCESS_JOB,
  SES_INBOUND_RECONCILE_JOB,
} from '@queues/background/enqueues/ses-inbound-jobs'
import { processSesInboundEmail, reconcileSesInboundEmails } from './processors.mts'

export const sesInboundHandlers = [
  backgroundHandler(SES_INBOUND_PROCESS_JOB, async job => {
    await processSesInboundEmail(job.data)
  }),
  backgroundHandler(SES_INBOUND_RECONCILE_JOB, async job => {
    await reconcileSesInboundEmails(job.data)
  }),
]
