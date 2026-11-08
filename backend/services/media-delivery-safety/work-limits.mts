import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  recovery_page_size: 100,
  edge_publish_batch_size: 4,
  registry_reconciliation_page_size: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const mediaDeliverySafetyWorkMaxValues = {
  recovery_page_size: 1000,
  edge_publish_batch_size: 16,
  registry_reconciliation_page_size: 10000,
}

export const mediaDeliverySafetyWorkConfig = new DynamicConfig({
  key: 'media-delivery-safety-work-config',
  fieldTypes: {
    recovery_page_size: 'number',
    edge_publish_batch_size: 'number',
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
