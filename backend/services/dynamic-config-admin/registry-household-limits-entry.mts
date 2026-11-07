import {
  householdLimitsConfig,
  householdLimitsMaxValues,
} from '@services/individuals-households/household-limits-config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const householdLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'household-limits-config',
  label: 'Household limits',
  description:
    'Maximum owned households per user, members per household, and households per individual.',
  config: householdLimitsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    max_households_per_user: {
      description: 'Maximum households a user owns.',
      minValue: 1,
      maxValue: householdLimitsMaxValues.max_households_per_user,
      integer: true,
    },
    max_members_per_household: {
      description: 'Maximum membership rows in one household, including the owner when stored.',
      minValue: 1,
      maxValue: householdLimitsMaxValues.max_members_per_household,
      integer: true,
    },
    max_households_per_individual: {
      description: 'Maximum distinct households an individual owns or has joined.',
      minValue: 1,
      maxValue: householdLimitsMaxValues.max_households_per_individual,
      integer: true,
    },
  },
})
