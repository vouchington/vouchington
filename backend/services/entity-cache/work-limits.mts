import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  bloom_backfill_batch_size: 5000,
  delete_keys_per_batch: 500,
}

/** Hard ceilings for the current runtime configuration contract. */
export const entityCacheWorkMaxValues = {
  bloom_backfill_batch_size: 50000,
  delete_keys_per_batch: 5000,
}

export const entityCacheWorkConfig = new DynamicConfig({
  key: 'entity-cache-work-config',
  fieldTypes: {
    bloom_backfill_batch_size: 'number',
    delete_keys_per_batch: 'number',
  },
  defaultFields,
})

export function getEntityCacheWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(entityCacheWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: entityCacheWorkMaxValues[field],
  })
}
