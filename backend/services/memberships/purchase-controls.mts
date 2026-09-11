import { DynamicConfig } from '@data-stores/valkey'
import type { MembershipPurchaseProvider } from './purchase-intents.mts'

export const membershipBillingControls = new DynamicConfig({
  key: 'membership-billing',
  fieldTypes: {
    stripe_enabled: 'boolean',
    stripe_automatic_collision_resolution_enabled: 'boolean',
    apple_app_store_enabled: 'boolean',
    apple_app_store_automatic_collision_resolution_enabled: 'boolean',
    google_play_enabled: 'boolean',
    google_play_automatic_collision_resolution_enabled: 'boolean',
    microsoft_store_enabled: 'boolean',
    microsoft_store_automatic_collision_resolution_enabled: 'boolean',
  },
  defaultFields: {
    stripe_enabled: false,
    stripe_automatic_collision_resolution_enabled: false,
    apple_app_store_enabled: false,
    apple_app_store_automatic_collision_resolution_enabled: false,
    google_play_enabled: false,
    google_play_automatic_collision_resolution_enabled: false,
    microsoft_store_enabled: false,
    microsoft_store_automatic_collision_resolution_enabled: false,
  },
})

const PROVIDER_CONTROL = {
  stripe: 'stripe_enabled',
  apple_app_store: 'apple_app_store_enabled',
  google_play: 'google_play_enabled',
  microsoft_store: 'microsoft_store_enabled',
} as const

export function isMembershipPurchaseEnabled(provider: MembershipPurchaseProvider): boolean {
  const fields = {
    ...membershipBillingControls.defaultFields,
    ...membershipBillingControls.getFields(),
  }
  return fields[PROVIDER_CONTROL[provider]] === true
}

const PROVIDER_COLLISION_CONTROL = {
  stripe: 'stripe_automatic_collision_resolution_enabled',
  apple_app_store: 'apple_app_store_automatic_collision_resolution_enabled',
  google_play: 'google_play_automatic_collision_resolution_enabled',
  microsoft_store: 'microsoft_store_automatic_collision_resolution_enabled',
} as const

export function isMembershipAutomaticCollisionResolutionEnabled(
  provider: MembershipPurchaseProvider,
): boolean {
  const fields = {
    ...membershipBillingControls.defaultFields,
    ...membershipBillingControls.getFields(),
  }
  return fields[PROVIDER_COLLISION_CONTROL[provider]] === true
}
