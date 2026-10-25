import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  backfill_batch_size: 500,
  dispatch_batch_size: 200,
  dispatch_minimum_age_seconds: 120,
  dispatch_maximum_age_seconds: 30 * 60,
}

/** Hard ceilings for the current runtime configuration contract. */
export const moderationReportsWorkMaxValues = {
  backfill_batch_size: 5000,
  dispatch_batch_size: 2000,
  dispatch_minimum_age_seconds: 3599,
  dispatch_maximum_age_seconds: 3600,
}

export const moderationReportsWorkConfig = new DynamicConfig({
  key: 'moderation-reports-work-config',
  fieldTypes: {
    backfill_batch_size: 'number',
    dispatch_batch_size: 'number',
    dispatch_minimum_age_seconds: 'number',
    dispatch_maximum_age_seconds: 'number',
  },
  defaultFields,
})

export function getModerationReportsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(moderationReportsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: moderationReportsWorkMaxValues[field],
  })
}
