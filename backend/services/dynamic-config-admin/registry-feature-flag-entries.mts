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
      membershipAppleBilling: {
        description:
          'Registered frontend visibility key with no web reader. New Apple purchase intents use membership-billing.',
      },
      membershipGoogleBilling: {
        description:
          'Registered frontend visibility key with no web reader. New Google Play purchase intents use membership-billing.',
      },
      membershipMicrosoftBilling: {
        description:
          'Registered frontend visibility key with no web reader. New Microsoft Store purchase intents use membership-billing.',
      },
      chat: {
        description: 'Registered key with no transcript-route or navigation consumer.',
      },
      combinedSearch: {
        description:
          'Route command-search dialog through a single /api/v1/search endpoint instead of five parallel entity endpoints.',
      },
      support: { description: 'Registered key with no in-app support route.' },
      fediverse: {
        description:
          'Fediverse navigation, command-search tab, and PeerTube discovery affordances.',
      },
    },
  }),
]
