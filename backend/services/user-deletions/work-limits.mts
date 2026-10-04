import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  dispatch_timeout_minutes: 5,
  processing_timeout_minutes: 30,
  batch_size: 100,
  lifecycle_recovery_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const userDeletionsWorkMaxValues = {
  dispatch_timeout_minutes: 120,
  processing_timeout_minutes: 720,
  batch_size: 1000,
  lifecycle_recovery_batch_size: 5000,
}

export const userDeletionsWorkConfig = new DynamicConfig({
  key: 'user-deletions-work-config',
  fieldTypes: {
    dispatch_timeout_minutes: 'number',
    processing_timeout_minutes: 'number',
    batch_size: 'number',
    lifecycle_recovery_batch_size: 'number',
  },
  defaultFields,
})

export function getUserDeletionsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(userDeletionsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: userDeletionsWorkMaxValues[field],
  })
}
