import { DynamicConfig } from '@data-stores/valkey-core/dynamic-config'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const STRIPE_PURCHASE_COLLISION_RECOVERY_INTERVAL_MS = 60_000
export const membershipPurchaseCollisionQueueMaxValues = {
  concurrency: 20,
  dispatch_concurrency: 5,
}
const defaults = { concurrency: 2, dispatch_concurrency: 1 }
export const membershipPurchaseCollisionQueueConfig = new DynamicConfig({
  key: 'membership-stripe-purchase-collision-queue-config',
  fieldTypes: { concurrency: 'number', dispatch_concurrency: 'number' },
  defaultFields: defaults,
})

export function stripePurchaseCollisionOrdering(dispatch = false) {
  const field = dispatch ? 'dispatch_concurrency' : 'concurrency'
  return {
    key: dispatch
      ? 'memberships:stripe-purchase-collision-dispatch'
      : 'memberships:stripe-purchase-collisions',
    concurrency: getBoundedPositiveIntegerField(membershipPurchaseCollisionQueueConfig, field, {
      defaultValue: defaults[field],
      maxValue: membershipPurchaseCollisionQueueMaxValues[field],
    }),
  }
}
