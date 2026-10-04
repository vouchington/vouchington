import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  reconcile_batch_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const openaiBackgroundResponsesWorkMaxValues = {
  reconcile_batch_size: 1000,
}

export const openaiBackgroundResponsesWorkConfig = new DynamicConfig({
  key: 'openai-background-responses-work-config',
  fieldTypes: {
    reconcile_batch_size: 'number',
  },
  defaultFields,
})

export function getOpenaiBackgroundResponsesWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(openaiBackgroundResponsesWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: openaiBackgroundResponsesWorkMaxValues[field],
  })
}
