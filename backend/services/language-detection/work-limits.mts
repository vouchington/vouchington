import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  backfill_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const languageDetectionWorkMaxValues = {
  backfill_batch_size: 5000,
}

export const languageDetectionWorkConfig = new DynamicConfig({
  key: 'language-detection-work-config',
  fieldTypes: {
    backfill_batch_size: 'number',
  },
  defaultFields,
})

export function getLanguageDetectionWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(languageDetectionWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: languageDetectionWorkMaxValues[field],
  })
}
