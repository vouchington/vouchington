import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import type {
  ProcessSendRenewalPriceIncreaseEmailData,
  RenewalNotificationCheckData,
} from '@queues/background/enqueues/memberships-domain'
import {
  MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB,
  MEMBERSHIPS_RENEWAL_CHECK_JOB,
  MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB,
} from '@queues/background/enqueues/memberships-jobs-2'
import onError from '@modules/on-error'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS } from '../config.mts'

const enqueueRenewalNotificationCheckJob = createBackgroundEnqueue(MEMBERSHIPS_RENEWAL_CHECK_JOB)

const enqueueDeliverMembershipEntitlementEffectsJob = createBackgroundEnqueue(
  MEMBERSHIPS_ENTITLEMENT_EFFECTS_JOB,
)

export const enqueueBulkSendRenewalPriceIncreaseEmail = createBackgroundBulkEnqueue(
  MEMBERSHIPS_RENEWAL_PRICE_INCREASE_EMAIL_JOB,
  (data: ProcessSendRenewalPriceIncreaseEmailData) => ({
    data,
    opts: {
      deduplication: {
        id: `processSendRenewalPriceIncreaseEmail__${data.membershipId}__${data.membershipProviderObservationId}__${data.generation}`,
        mode: 'debounce' as const,
        ttl: 86_400_000,
      },
    },
  }),
)

export function enqueueRenewalNotificationCheck(
  data: RenewalNotificationCheckData = {},
): EnqueueReturnType {
  return enqueueRenewalNotificationCheckJob(data, {
    deduplication: { id: `renewal-check:${data.afterId ?? 'root'}`, mode: 'throttle', ttl: 60_000 },
  })
}

export function enqueueDeliverMembershipEntitlementEffects(): EnqueueReturnType {
  const jobId = `membership-entitlement-effects__${Math.floor(Date.now() / MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS)}`
  return enqueueDeliverMembershipEntitlementEffectsJob({}, {
    jobId,
    deduplication: {
      id: 'membership-entitlement-effects',
      mode: 'throttle',
      ttl: MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueDeliverMembershipEntitlementEffectsBestEffort(): Promise<void> {
  return Promise.resolve(enqueueDeliverMembershipEntitlementEffects()).then(
    () => undefined,
    onError,
  )
}
