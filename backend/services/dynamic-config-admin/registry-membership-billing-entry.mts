import { membershipBillingControls } from '@services/memberships/purchase-controls'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'

export const membershipBillingRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'membership-billing',
  label: 'Membership Billing',
  description:
    'Independent backend controls for new provider purchases and automatic collision resolution.',
  config: membershipBillingControls,
  access: { update_roles: ['developer'] },
  fields: {
    stripe_enabled: { description: 'Allow new Stripe membership purchase intents.' },
    stripe_automatic_collision_resolution_enabled: {
      description: 'Allow automatic collision resolution for Stripe membership sources.',
    },
    apple_app_store_enabled: {
      description: 'Allow new Apple App Store membership purchase intents.',
    },
    apple_app_store_automatic_collision_resolution_enabled: {
      description: 'Allow automatic collision resolution for Apple App Store sources.',
    },
    google_play_enabled: { description: 'Allow new Google Play membership purchase intents.' },
    google_play_automatic_collision_resolution_enabled: {
      description: 'Allow automatic collision resolution for Google Play membership sources.',
    },
    microsoft_store_enabled: {
      description: 'Allow new Microsoft Store membership purchase intents.',
    },
    microsoft_store_automatic_collision_resolution_enabled: {
      description: 'Allow automatic collision resolution for Microsoft Store membership sources.',
    },
  },
})
