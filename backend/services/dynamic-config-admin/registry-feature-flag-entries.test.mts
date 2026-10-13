import { featureFlagsConfig } from '@services/feature-flags/config'
import { getFeatureFlags } from '@services/feature-flags'
import { describe, expect, it } from 'vitest'
import { featureFlagDynamicConfigRegistryEntries } from './registry-feature-flag-entries.mts'

describe('feature flag admin metadata', () => {
  it('matches the runtime flag set and the behavior each reader implements', () => {
    const entry = featureFlagDynamicConfigRegistryEntries[0]!
    const runtimeFields = Object.keys(featureFlagsConfig.fieldTypes).toSorted()

    expect(Object.keys(featureFlagsConfig.defaultFields).toSorted()).toEqual(runtimeFields)
    expect(Object.keys(entry.fields).toSorted()).toEqual(runtimeFields)

    const flags = getFeatureFlags()
    expect(Object.keys(flags).toSorted()).toEqual(runtimeFields)
    for (const name of runtimeFields) {
      expect(typeof flags[name]).toBe('boolean')
    }

    expect(entry.fields).toMatchObject({
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
      support: {
        description: 'Registered key with no in-app support route.',
      },
      fediverse: {
        description:
          'Fediverse navigation, command-search tab, and PeerTube discovery affordances.',
      },
    })
  })
})
