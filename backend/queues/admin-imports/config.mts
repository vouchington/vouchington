import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const QUEUE_NAME = 'admin-imports'
export const PRIORITY_DEFAULT = 10

export const ADMIN_IMPORTS_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
  deduplicationTtlMs: 60_000,
}

const defaultFields = {
  insert_chunk_size: 1000,
  enqueue_chunk_size: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const adminImportsWorkMaxValues = {
  insert_chunk_size: 10000,
  enqueue_chunk_size: 10000,
}

export const adminImportsWorkConfig = new DynamicConfig({
  key: 'admin-imports-work-config',
  fieldTypes: {
    insert_chunk_size: 'number',
    enqueue_chunk_size: 'number',
  },
  defaultFields,
})

export function getAdminImportsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(adminImportsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: adminImportsWorkMaxValues[field],
  })
}
