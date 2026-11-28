import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  comparison_max_batches: 1000,
  decision_calls_page_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const classifiersWorkMaxValues = {
  comparison_max_batches: 10000,
  decision_calls_page_size: 1000,
}

export const classifiersWorkConfig = new DynamicConfig({
  key: 'classifiers-work-config',
  fieldTypes: {
    comparison_max_batches: 'number',
    decision_calls_page_size: 'number',
  },
  defaultFields,
})

export function getClassifiersWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(classifiersWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: classifiersWorkMaxValues[field],
  })
}
