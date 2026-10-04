import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  dispatch_timeout_minutes: 5,
  processing_timeout_minutes: 30,
  recovery_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const stripeWorkMaxValues = {
  dispatch_timeout_minutes: 120,
  processing_timeout_minutes: 720,
  recovery_batch_size: 5000,
}

export const stripeWorkConfig = new DynamicConfig({
  key: 'stripe-work-config',
  fieldTypes: {
    dispatch_timeout_minutes: 'number',
    processing_timeout_minutes: 'number',
    recovery_batch_size: 'number',
  },
  defaultFields,
})

export function getStripeWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(stripeWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: stripeWorkMaxValues[field],
  })
}
