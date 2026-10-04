import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  recovery_page_size: 100,
  registry_reconciliation_page_size: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const mediaDeliverySafetyWorkMaxValues = {
  recovery_page_size: 1000,
  registry_reconciliation_page_size: 10000,
}

export const mediaDeliverySafetyWorkConfig = new DynamicConfig({
  key: 'media-delivery-safety-work-config',
  fieldTypes: {
    recovery_page_size: 'number',
    registry_reconciliation_page_size: 'number',
  },
  defaultFields,
})

export function getMediaDeliverySafetyWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(mediaDeliverySafetyWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: mediaDeliverySafetyWorkMaxValues[field],
  })
}
