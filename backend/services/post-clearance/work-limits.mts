import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  attempt_lease_minutes: 4,
  first_retry_minutes: 5,
  later_retry_minutes: 20,
}

/** Hard ceilings for the current runtime configuration contract. */
export const postClearanceWorkMaxValues = {
  attempt_lease_minutes: 96,
  first_retry_minutes: 120,
  later_retry_minutes: 480,
}

export const postClearanceWorkConfig = new DynamicConfig({
  key: 'post-clearance-work-config',
  fieldTypes: {
    attempt_lease_minutes: 'number',
    first_retry_minutes: 'number',
    later_retry_minutes: 'number',
  },
  defaultFields,
})

export function getPostClearanceWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(postClearanceWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: postClearanceWorkMaxValues[field],
  })
}
