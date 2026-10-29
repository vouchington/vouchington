import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  bloom_backfill_batch_size: 5000,
  delete_keys_per_batch: 500,
  hostname_invalidation_lease_seconds: 300,
  hostname_invalidation_retry_ceiling_seconds: 300,
}

/** Hard ceilings for the current runtime configuration contract. */
export const entityCacheWorkMaxValues = {
  bloom_backfill_batch_size: 50000,
  delete_keys_per_batch: 5000,
  hostname_invalidation_lease_seconds: 3600,
  hostname_invalidation_retry_ceiling_seconds: 3600,
}

export const entityCacheWorkMinValues = {
  hostname_invalidation_lease_seconds: 60,
}

export const entityCacheWorkConfig = new DynamicConfig({
  key: 'entity-cache-work-config',
  fieldTypes: {
    bloom_backfill_batch_size: 'number',
    delete_keys_per_batch: 'number',
    hostname_invalidation_lease_seconds: 'number',
    hostname_invalidation_retry_ceiling_seconds: 'number',
  },
  defaultFields,
})

export function getEntityCacheWorkLimit(field: keyof typeof defaultFields): number {
  const value = getBoundedPositiveIntegerField(entityCacheWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: entityCacheWorkMaxValues[field],
  })
  return field === 'hostname_invalidation_lease_seconds'
    ? Math.max(entityCacheWorkMinValues.hostname_invalidation_lease_seconds, value)
    : value
}
