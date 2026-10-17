import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundJob } from './define-job.mts'
import {
  ACTIVITYPUB_DOMAIN as DOMAIN,
  type ActivityPubInboxDeliveryJob,
  type DeliverActivityData,
  type DistributeActivityData,
  type EmptyActivityPubJobData as EmptyData,
  type RearmFailedDeliveriesData,
} from './activitypub-domain.mts'

const DELIVERY = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const
const INBOX = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

export const ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB = defineBackgroundJob<DistributeActivityData>(
  DOMAIN,
  { name: 'distributeActivity', priority: PRIORITY_TASK, ...DELIVERY },
)
export const ACTIVITYPUB_DELIVER_ACTIVITY_JOB = defineBackgroundJob<DeliverActivityData>(DOMAIN, {
  name: 'deliverActivity',
  priority: PRIORITY_TASK,
  ...DELIVERY,
})
export const ACTIVITYPUB_PROCESS_DELIVERY_JOB = defineBackgroundJob<ActivityPubInboxDeliveryJob>(
  DOMAIN,
  { name: 'processDelivery', priority: PRIORITY_TASK, ...INBOX },
)
export const ACTIVITYPUB_RECOVER_DELIVERIES_JOB = defineBackgroundJob<EmptyData>(DOMAIN, {
  name: 'recoverDeliveries',
  priority: PRIORITY_DISPATCH,
  ...INBOX,
})
export const ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB =
  defineBackgroundJob<RearmFailedDeliveriesData>(DOMAIN, {
    name: 'rearmFailedDeliveries',
    priority: PRIORITY_DISPATCH,
    ...INBOX,
  })
export const ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB = defineBackgroundJob<EmptyData>(DOMAIN, {
  name: 'cleanupExpiredDeliveries',
  priority: PRIORITY_DISPATCH,
  ...INBOX,
})

export const ACTIVITYPUB_JOBS = [
  ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB,
  ACTIVITYPUB_DELIVER_ACTIVITY_JOB,
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  ACTIVITYPUB_RECOVER_DELIVERIES_JOB,
  ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB,
  ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB,
] as const
