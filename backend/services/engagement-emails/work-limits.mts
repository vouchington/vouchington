import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  dispatch_batch_size: 250,
}

/** Hard ceilings for the current runtime configuration contract. */
export const engagementEmailsWorkMaxValues = {
  dispatch_batch_size: 2500,
}

export const engagementEmailsWorkConfig = new DynamicConfig({
  key: 'engagement-emails-work-config',
  fieldTypes: {
    dispatch_batch_size: 'number',
  },
  defaultFields,
})

export function getEngagementEmailsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(engagementEmailsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: engagementEmailsWorkMaxValues[field],
  })
}
