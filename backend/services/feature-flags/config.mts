import { DynamicConfig } from '@data-stores/valkey'

export const featureFlagsConfig = new DynamicConfig({
  key: 'feature-flags',
  fieldTypes: {
    memberships: 'boolean',
    membershipStripeBilling: 'boolean',
    fediverse: 'boolean',
  },
  defaultFields: {
    memberships: false,
    membershipStripeBilling: false,
    fediverse: false,
  },
})
