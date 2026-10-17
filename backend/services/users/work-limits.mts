import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  engagement_claim_hours: 24,
}

/** Hard ceilings for the current runtime configuration contract. */
export const usersWorkMaxValues = {
  engagement_claim_hours: 576,
}

export const usersWorkConfig = new DynamicConfig({
  key: 'users-work-config',
  fieldTypes: {
    engagement_claim_hours: 'number',
  },
  defaultFields,
})

export function getUsersWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(usersWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: usersWorkMaxValues[field],
  })
}
