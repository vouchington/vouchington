import { featureFlagsConfig } from '@services/feature-flags/config'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'

export const featureFlagDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'feature-flags',
    label: 'Feature Flags',
    description: 'Runtime feature toggles with optional browser-local overrides.',
    config: featureFlagsConfig,
    access: { update_roles: ['developer'] },
    fields: {
      memberships: { description: 'Membership purchase and plan-management flows.' },
      membershipStripeBilling: {
        description: 'Expose Stripe membership purchase calls to the web plans page.',
      },
      membershipAppleBilling: {
        description: 'Allow new Apple App Store membership purchases.',
      },
      membershipGoogleBilling: {
        description: 'Allow new Google Play membership purchases.',
      },
      membershipMicrosoftBilling: {
        description: 'Allow new Microsoft Store membership purchases.',
      },
      chat: { description: 'Chat entry points and conversation features.' },
      combinedSearch: {
        description:
          'Route command-search dialog through a single /api/v1/search endpoint instead of five parallel entity endpoints.',
      },
      support: { description: 'Support chat entry point in the chat sidebar.' },
      fediverse: {
        description:
          'Fediverse navigation, command-search tab, and PeerTube discovery affordances.',
      },
    },
  }),
]
