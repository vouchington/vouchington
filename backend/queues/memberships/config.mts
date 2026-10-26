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

export const membershipVerificationQueueMaxValues = {
  verification_concurrency: 20,
  dispatch_concurrency: 5,
}
const defaults = { verification_concurrency: 2, dispatch_concurrency: 1 }
export const membershipVerificationQueueConfig = new DynamicConfig({
  key: 'membership-verification-queue-config',
  fieldTypes: { verification_concurrency: 'number', dispatch_concurrency: 'number' },
  defaultFields: defaults,
})

export function membershipVerificationOrdering(dispatcher = false) {
  const field = dispatcher ? 'dispatch_concurrency' : 'verification_concurrency'
  return {
    key: dispatcher ? 'memberships:verification-dispatch' : 'memberships:verification',
    concurrency: getBoundedPositiveIntegerField(membershipVerificationQueueConfig, field, {
      defaultValue: defaults[field],
      maxValue: membershipVerificationQueueMaxValues[field],
    }),
  }
}
