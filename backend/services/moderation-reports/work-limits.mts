import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  backfill_batch_size: 500,
  dispatch_batch_size: 200,
}

/** Hard ceilings for the current runtime configuration contract. */
export const moderationReportsWorkMaxValues = {
  backfill_batch_size: 5000,
  dispatch_batch_size: 2000,
}

export const moderationReportsWorkConfig = new DynamicConfig({
  key: 'moderation-reports-work-config',
  fieldTypes: {
    backfill_batch_size: 'number',
    dispatch_batch_size: 'number',
  },
  defaultFields,
})

export function getModerationReportsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(moderationReportsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: moderationReportsWorkMaxValues[field],
  })
}
