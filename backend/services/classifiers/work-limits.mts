import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  comparison_max_batches: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const classifiersWorkMaxValues = {
  comparison_max_batches: 10000,
}

export const classifiersWorkConfig = new DynamicConfig({
  key: 'classifiers-work-config',
  fieldTypes: {
    comparison_max_batches: 'number',
  },
  defaultFields,
})

export function getClassifiersWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(classifiersWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: classifiersWorkMaxValues[field],
  })
}
