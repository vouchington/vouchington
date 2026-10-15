import {
  ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB,
  ACTIVITYPUB_DELIVER_ACTIVITY_JOB,
  ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB,
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB,
  ACTIVITYPUB_RECOVER_DELIVERIES_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { processDeliverActivityJob, processDistributeActivityJob } from './processors.mts'
import {
  cleanupExpiredDeliveries,
  processDelivery,
  rearmFailedDeliveries,
  recoverDeliveries,
} from './processors/inbox.mts'
import { isFinalActivityPubInboxAttempt } from './processors/inbox-job.mts'

export { isFinalActivityPubInboxAttempt } from './processors/inbox-job.mts'

export const activitypubHandlers = [
  backgroundHandler(ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB, processDistributeActivityJob),
  backgroundHandler(ACTIVITYPUB_DELIVER_ACTIVITY_JOB, job => processDeliverActivityJob(job)),
  backgroundHandler(ACTIVITYPUB_PROCESS_DELIVERY_JOB, job =>
    processDelivery(job.data, { isFinalAttempt: isFinalActivityPubInboxAttempt(job) }),
  ),
  backgroundHandler(ACTIVITYPUB_RECOVER_DELIVERIES_JOB, () => recoverDeliveries()),
  backgroundHandler(ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB, job =>
    rearmFailedDeliveries(job.data.afterId),
  ),
  backgroundHandler(ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB, () => cleanupExpiredDeliveries()),
]
