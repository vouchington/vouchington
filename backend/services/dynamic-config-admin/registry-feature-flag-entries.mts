import { featureFlagsConfig } from '@services/feature-flags/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const featureFlagDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'feature-flags',
    label: 'Feature Flags',
    description: 'Runtime feature toggles with optional browser-local overrides.',
    config: featureFlagsConfig,
    access: { update_roles: ['developer'] },
    fields: {
      memberships: {
        description:
          'Shows Stripe purchase controls on the web plans page together with membershipStripeBilling. Membership pages and purchase APIs stay available.',
      },
      membershipStripeBilling: {
        description:
          'Shows Stripe purchase controls on the web plans page together with memberships. New Stripe purchase intents use membership-billing.',
      },
      fediverse: {
        description:
          'Fediverse navigation, command-search tab, and PeerTube discovery affordances.',
      },
    },
  }),
]
