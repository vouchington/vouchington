import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  backfill_batch_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const blueskyFollowsWorkMaxValues = {
  backfill_batch_size: 5000,
}

export const blueskyFollowsWorkConfig = new DynamicConfig({
  key: 'bluesky-follows-work-config',
  fieldTypes: {
    backfill_batch_size: 'number',
  },
  defaultFields,
})

export function getBlueskyFollowsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(blueskyFollowsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: blueskyFollowsWorkMaxValues[field],
  })
}
