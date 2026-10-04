import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  dispatch_timeout_minutes: 5,
  processing_timeout_minutes: 30,
  delivery_transition_recovery_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const apInboxActivitiesWorkMaxValues = {
  dispatch_timeout_minutes: 120,
  processing_timeout_minutes: 720,
  delivery_transition_recovery_batch_size: 5000,
}

export const apInboxActivitiesWorkConfig = new DynamicConfig({
  key: 'ap-inbox-activities-work-config',
  fieldTypes: {
    dispatch_timeout_minutes: 'number',
    processing_timeout_minutes: 'number',
    delivery_transition_recovery_batch_size: 'number',
  },
  defaultFields,
})

export function getApInboxActivitiesWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(apInboxActivitiesWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: apInboxActivitiesWorkMaxValues[field],
  })
}
