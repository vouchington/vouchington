import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  reconciliation_batch_size: 100,
}

/** Hard ceiling for the current runtime configuration contract. */
export const postClearanceWorkMaxValues = {
  reconciliation_batch_size: 1000,
}

export const postClearanceWorkConfig = new DynamicConfig({
  key: 'post-clearance-work-config',
  fieldTypes: {
    reconciliation_batch_size: 'number',
  },
  defaultFields,
})

export function getPostClearanceWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(postClearanceWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: postClearanceWorkMaxValues[field],
  })
}
