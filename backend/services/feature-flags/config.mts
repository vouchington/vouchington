import { DynamicConfig } from '@data-stores/valkey'

export const featureFlagsConfig = new DynamicConfig({
  key: 'feature-flags',
  fieldTypes: {
    memberships: 'boolean',
    membershipStripeBilling: 'boolean',
    membershipAppleBilling: 'boolean',
    membershipGoogleBilling: 'boolean',
    membershipMicrosoftBilling: 'boolean',
    chat: 'boolean',
    combinedSearch: 'boolean',
    support: 'boolean',
    fediverse: 'boolean',
  },
  defaultFields: {
    memberships: false,
    membershipStripeBilling: false,
    membershipAppleBilling: false,
    membershipGoogleBilling: false,
    membershipMicrosoftBilling: false,
    chat: false,
    combinedSearch: false,
    support: false,
    fediverse: false,
  },
})
