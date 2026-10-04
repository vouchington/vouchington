import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  discovery_page_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const classifierRunsWorkMaxValues = {
  discovery_page_size: 1000,
}

export const classifierRunsWorkConfig = new DynamicConfig({
  key: 'classifier-runs-work-config',
  fieldTypes: {
    discovery_page_size: 'number',
  },
  defaultFields,
})

export function getClassifierRunsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(classifierRunsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: classifierRunsWorkMaxValues[field],
  })
}
