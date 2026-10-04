import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  backfill_batch_size: 500,
  recipient_chunk_size: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const followerDistributionsWorkMaxValues = {
  backfill_batch_size: 5000,
  recipient_chunk_size: 5000,
}

export const followerDistributionsWorkConfig = new DynamicConfig({
  key: 'follower-distributions-work-config',
  fieldTypes: {
    backfill_batch_size: 'number',
    recipient_chunk_size: 'number',
  },
  defaultFields,
})

export function getFollowerDistributionsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(followerDistributionsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: followerDistributionsWorkMaxValues[field],
  })
}
