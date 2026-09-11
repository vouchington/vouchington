import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import onError from '@modules/on-error'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs, ProcessSendRenewalPriceIncreaseEmailData } from '../types.mts'

const ENTITLEMENT_EFFECTS_JOB_NAME: MembershipsJobs = 'deliverMembershipEntitlementEffects'
const RENEWAL_CHECK_JOB_NAME: MembershipsJobs = 'processRenewalNotificationCheck'
const RENEWAL_PRICE_INCREASE_JOB_NAME: MembershipsJobs = 'processSendRenewalPriceIncreaseEmail'

const enqueueRenewalNotificationCheckJob = createEnqueueFunction<
  Record<string, never>,
  MembershipsJobs
>({ queue: memberships, queueName: QUEUE_NAME, jobName: RENEWAL_CHECK_JOB_NAME })

const enqueueDeliverMembershipEntitlementEffectsJob = createEnqueueFunction<
  Record<string, never>,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: ENTITLEMENT_EFFECTS_JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

const enqueueBulkSendRenewalPriceIncreaseEmailJobs = createBulkEnqueueFunction<
  ProcessSendRenewalPriceIncreaseEmailData,
  ProcessSendRenewalPriceIncreaseEmailData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: RENEWAL_PRICE_INCREASE_JOB_NAME,
  buildJob: data => ({
    data,
    opts: {
      deduplication: {
        id: `processSendRenewalPriceIncreaseEmail__${data.membershipId}__${data.membershipProviderObservationId}`,
        mode: 'debounce' as const,
        ttl: 86_400_000,
      },
    },
  }),
})

export function enqueueRenewalNotificationCheck(): EnqueueReturnType {
  return enqueueRenewalNotificationCheckJob({}, { priority: PRIORITY_DISPATCHER })
}

export function enqueueDeliverMembershipEntitlementEffects(): EnqueueReturnType {
  const jobId = `membership-entitlement-effects__${Math.floor(Date.now() / MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS)}`
  return enqueueDeliverMembershipEntitlementEffectsJob({}, {
    jobId,
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: 'membership-entitlement-effects',
      mode: 'throttle',
      ttl: MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueDeliverMembershipEntitlementEffectsBestEffort(): void {
  void Promise.resolve(enqueueDeliverMembershipEntitlementEffects()).catch(onError)
}

export function enqueueBulkSendRenewalPriceIncreaseEmail(
  users: ProcessSendRenewalPriceIncreaseEmailData[],
): EnqueueReturnType {
  return enqueueBulkSendRenewalPriceIncreaseEmailJobs(users, { priority: PRIORITY_DEFAULT })
}
