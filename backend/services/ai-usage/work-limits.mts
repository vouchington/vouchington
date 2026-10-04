import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  release_batch_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const aiUsageWorkMaxValues = {
  release_batch_size: 1000,
}

export const aiUsageWorkConfig = new DynamicConfig({
  key: 'ai-usage-work-config',
  fieldTypes: {
    release_batch_size: 'number',
  },
  defaultFields,
})

export function getAiUsageWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(aiUsageWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: aiUsageWorkMaxValues[field],
  })
}
