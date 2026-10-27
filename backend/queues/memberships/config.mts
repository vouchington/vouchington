import { DynamicConfig } from '@data-stores/valkey-core/dynamic-config'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const QUEUE_NAME = 'memberships'
export const PRIORITY_DEFAULT = 10
export const PRIORITY_DISPATCHER = 100
export const MEMBERSHIP_ENTITLEMENT_EFFECTS_INTERVAL_MS = 60_000
export const MEMBERSHIP_GRANT_EXPIRY_INTERVAL_MS = 60_000
export const STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS = 300_000
export const APPLE_NOTIFICATION_RECOVERY_INTERVAL_MS = 300_000
export const GOOGLE_PLAY_RECOVERY_INTERVAL_MS = 300_000
export const GOOGLE_PLAY_ACTIVE_SOURCE_RECOVERY_INTERVAL_MS = 60 * 60 * 1000
export const GOOGLE_PLAY_OIDC_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000
export const MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS = 60 * 60 * 1000
export const MEMBERSHIP_REFUND_RECONCILIATION_INTERVAL_MS = 300_000
export const MEMBERSHIP_PAUSE_COLLECTION_INTERVAL_MS = 60_000
export const MEMBERSHIP_VERIFICATION_LOCK_DURATION_MS = 60_000

export const membershipVerificationQueueMaxValues = {
  verification_concurrency: 20,
  dispatch_concurrency: 5,
  verification_retry_minutes: 120,
}
const defaults = {
  verification_concurrency: 2,
  dispatch_concurrency: 1,
  verification_retry_minutes: 5,
}
export const membershipVerificationQueueConfig = new DynamicConfig({
  key: 'membership-verification-queue-config',
  fieldTypes: {
    verification_concurrency: 'number',
    dispatch_concurrency: 'number',
    verification_retry_minutes: 'number',
  },
  defaultFields: defaults,
})

export function getMembershipVerificationRetryMinutes(): number {
  return getBoundedPositiveIntegerField(
    membershipVerificationQueueConfig,
    'verification_retry_minutes',
    {
      defaultValue: defaults.verification_retry_minutes,
      maxValue: membershipVerificationQueueMaxValues.verification_retry_minutes,
    },
  )
}

export function getMembershipVerificationConcurrency(): number {
  return getBoundedPositiveIntegerField(
    membershipVerificationQueueConfig,
    'verification_concurrency',
    {
      defaultValue: defaults.verification_concurrency,
      maxValue: membershipVerificationQueueMaxValues.verification_concurrency,
    },
  )
}

export function membershipVerificationOrdering(verificationId: string) {
  return {
    key: `memberships:verification:${verificationId}`,
    concurrency: 1,
  }
}

export function membershipVerificationDispatchOrdering() {
  return {
    key: 'memberships:verification-dispatch',
    concurrency: getBoundedPositiveIntegerField(
      membershipVerificationQueueConfig,
      'dispatch_concurrency',
      {
        defaultValue: defaults.dispatch_concurrency,
        maxValue: membershipVerificationQueueMaxValues.dispatch_concurrency,
      },
    ),
  }
}
