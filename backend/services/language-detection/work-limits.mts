import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  backfill_batch_size: 500,
  backfill_max_rows_per_run: 5_000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const languageDetectionWorkMaxValues = {
  backfill_batch_size: 5000,
  backfill_max_rows_per_run: 50_000,
}

export const languageDetectionWorkConfig = new DynamicConfig({
  key: 'language-detection-work-config',
  fieldTypes: {
    backfill_batch_size: 'number',
    backfill_max_rows_per_run: 'number',
  },
  defaultFields,
})

export function getLanguageDetectionWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(languageDetectionWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: languageDetectionWorkMaxValues[field],
  })
}
