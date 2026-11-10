import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  max_households_per_user: 2,
  max_members_per_household: 25,
  max_households_per_individual: 5,
}

export const householdLimitsMaxValues = {
  max_households_per_user: 2,
  max_members_per_household: 25,
  max_households_per_individual: 5,
} as const

export const householdLimitsConfig = new DynamicConfig({
  key: 'household-limits-config',
  fieldTypes: {
    max_households_per_user: 'number',
    max_members_per_household: 'number',
    max_households_per_individual: 'number',
  },
  defaultFields,
})

export function getHouseholdLimits(): {
  householdsPerUser: number
  membersPerHousehold: number
  householdsPerIndividual: number
} {
  return {
    householdsPerUser: getBoundedPositiveIntegerField(
      householdLimitsConfig,
      'max_households_per_user',
      {
        defaultValue: defaultFields.max_households_per_user,
        maxValue: householdLimitsMaxValues.max_households_per_user,
      },
    ),
    membersPerHousehold: getBoundedPositiveIntegerField(
      householdLimitsConfig,
      'max_members_per_household',
      {
        defaultValue: defaultFields.max_members_per_household,
        maxValue: householdLimitsMaxValues.max_members_per_household,
      },
    ),
    householdsPerIndividual: getBoundedPositiveIntegerField(
      householdLimitsConfig,
      'max_households_per_individual',
      {
        defaultValue: defaultFields.max_households_per_individual,
        maxValue: householdLimitsMaxValues.max_households_per_individual,
      },
    ),
  }
}
