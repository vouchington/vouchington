import {
  awaitReportedEnqueueAdmission,
  createBulkEnqueueFunction,
} from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { memberships } from '../queues.mts'
import type {
  MembershipsJobPayloads,
  MembershipsJobs,
  ProcessSendRenewalPriceIncreaseEmailData,
} from '../types.mts'
import { createMembershipEnqueueFunction } from './typed-job.mts'

const ENTITLEMENT_EFFECTS_JOB_NAME = 'deliverMembershipEntitlementEffects' satisfies MembershipsJobs
const RENEWAL_CHECK_JOB_NAME = 'processRenewalNotificationCheck' satisfies MembershipsJobs
const RENEWAL_PRICE_INCREASE_JOB_NAME =
  'processSendRenewalPriceIncreaseEmail' satisfies MembershipsJobs

const enqueueRenewalNotificationCheckJob = createMembershipEnqueueFunction(RENEWAL_CHECK_JOB_NAME)

const enqueueDeliverMembershipEntitlementEffectsJob = createMembershipEnqueueFunction(
  ENTITLEMENT_EFFECTS_JOB_NAME,
  {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
)

const enqueueBulkSendRenewalPriceIncreaseEmailJobs = createBulkEnqueueFunction({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: RENEWAL_PRICE_INCREASE_JOB_NAME,
  buildJob: (data: ProcessSendRenewalPriceIncreaseEmailData) => ({
    data: data satisfies MembershipsJobPayloads[typeof RENEWAL_PRICE_INCREASE_JOB_NAME],
    opts: {
      deduplication: {
        id: `processSendRenewalPriceIncreaseEmail__${data.membershipId}__${data.membershipProviderObservationId}__${data.generation}`,
        mode: 'debounce' as const,
      },
    },
  }),
})

export function enqueueRenewalNotificationCheck(
  data: MembershipsJobPayloads[typeof RENEWAL_CHECK_JOB_NAME] = {},
): EnqueueReturnType {
  return enqueueRenewalNotificationCheckJob(data, {
    priority: PRIORITY_DISPATCHER,
    deduplication: { id: `renewal-check:${data.afterId ?? 'root'}`, mode: 'throttle', ttl: 60_000 },
  })
}

export function enqueueDeliverMembershipEntitlementEffects(): Promise<unknown> {
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

export function enqueueDeliverMembershipEntitlementEffectsBestEffort(): Promise<void> {
  return awaitReportedEnqueueAdmission(() => enqueueDeliverMembershipEntitlementEffects())
}

export function enqueueBulkSendRenewalPriceIncreaseEmail(
  users: ProcessSendRenewalPriceIncreaseEmailData[],
): EnqueueReturnType {
  return enqueueBulkSendRenewalPriceIncreaseEmailJobs(users, { priority: PRIORITY_DEFAULT })
}
