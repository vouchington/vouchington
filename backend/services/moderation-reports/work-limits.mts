import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  backfill_batch_size: 500,
  dispatch_batch_size: 200,
  dispatch_min_age_seconds: 120,
  dispatch_max_age_seconds: 1800,
}

/** Hard ceilings for the current runtime configuration contract. */
export const moderationReportsWorkMaxValues = {
  backfill_batch_size: 5000,
  dispatch_batch_size: 2000,
  dispatch_min_age_seconds: 600,
  dispatch_max_age_seconds: 86400,
}

// Even at the largest minimum age, leave ten minutes for the five-minute recovery sweep.
export const MIN_DISPATCH_MAX_AGE_SECONDS = 1200

export const moderationReportsWorkConfig = new DynamicConfig({
  key: 'moderation-reports-work-config',
  fieldTypes: {
    backfill_batch_size: 'number',
    dispatch_batch_size: 'number',
    dispatch_min_age_seconds: 'number',
    dispatch_max_age_seconds: 'number',
  },
  defaultFields,
})

export function getModerationReportsWorkLimit(field: keyof typeof defaultFields): number {
  const value = getBoundedPositiveIntegerField(moderationReportsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: moderationReportsWorkMaxValues[field],
  })
  return field === 'dispatch_max_age_seconds'
    ? Math.max(MIN_DISPATCH_MAX_AGE_SECONDS, value)
    : value
}
