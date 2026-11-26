import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

/** Namespaced so a row's deduplication id can never collide with another domain's. */
export const ADMIN_TOPIC_IMPORT_ROW_DEDUP_PREFIX = 'imports.processAdminTopicImportRow'

/** Job ids may not contain colons, so the domain prefix uses an underscore. */
export const ADMIN_TOPIC_IMPORT_DISPATCH_ID_PREFIX = 'imports_dispatchAdminTopicImport'

const defaultFields = {
  max_rows_per_batch: 50000,
  max_parent_slugs_per_row: 20,
  insert_chunk_size: 1000,
  dispatch_page_size: 1000,
  recovery_batch_size: 100,
}

/** Hard ceilings for the current runtime configuration contract. */
export const adminImportsWorkMaxValues = {
  max_rows_per_batch: 50000,
  max_parent_slugs_per_row: 20,
  insert_chunk_size: 10000,
  dispatch_page_size: 10000,
  recovery_batch_size: 1000,
}

export const adminImportsWorkConfig = new DynamicConfig({
  key: 'admin-imports-work-config',
  fieldTypes: {
    max_rows_per_batch: 'number',
    max_parent_slugs_per_row: 'number',
    insert_chunk_size: 'number',
    dispatch_page_size: 'number',
    recovery_batch_size: 'number',
  },
  defaultFields,
})

export function getAdminImportsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(adminImportsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: adminImportsWorkMaxValues[field],
  })
}

export { IMPORT_RECOVERY_STALE_MS } from '@queues/background/enqueues/imports-jobs'
