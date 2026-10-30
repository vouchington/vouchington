import {
  ACTIVITYPUB_DELIVER_ACTIVITY_JOB,
  ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB,
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  ACTIVITYPUB_RECOVER_OUTBOUND_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { processDeliverActivityJob, processDistributeActivityJob } from './processors.mts'
import { processDelivery } from './processors/inbox.mts'
import { processRecoverOutboundDistributionJob } from './processors/outbound-recovery.mts'

export const activitypubHandlers = [
  backgroundHandler(ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB, processDistributeActivityJob),
  backgroundHandler(ACTIVITYPUB_RECOVER_OUTBOUND_JOB, processRecoverOutboundDistributionJob),
  backgroundHandler(ACTIVITYPUB_DELIVER_ACTIVITY_JOB, processDeliverActivityJob),
  backgroundHandler(ACTIVITYPUB_PROCESS_DELIVERY_JOB, job =>
    processDelivery(job.data, {
      moveToDelayed: timestamp => job.moveToDelayed(timestamp),
      updateData: data => job.updateData(data),
    }),
  ),
]
