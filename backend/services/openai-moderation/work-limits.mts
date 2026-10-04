import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  backfill_batch_size: 500,
  image_quarantine_batch_size: 25,
}

/** Hard ceilings for the current runtime configuration contract. */
export const openaiModerationWorkMaxValues = {
  backfill_batch_size: 5000,
  image_quarantine_batch_size: 1000,
}

export const openaiModerationWorkConfig = new DynamicConfig({
  key: 'openai-moderation-work-config',
  fieldTypes: {
    backfill_batch_size: 'number',
    image_quarantine_batch_size: 'number',
  },
  defaultFields,
})

export function getOpenaiModerationWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(openaiModerationWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: openaiModerationWorkMaxValues[field],
  })
}
