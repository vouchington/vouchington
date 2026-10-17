import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

/** Namespaced so a row's deduplication id can never collide with another domain's. */
export const ADMIN_TOPIC_IMPORT_ROW_DEDUP_PREFIX = 'imports.processAdminTopicImportRow'

/** Job ids may not contain colons, so the domain prefix uses an underscore. */
export const ADMIN_TOPIC_IMPORT_DISPATCH_ID_PREFIX = 'imports_dispatchAdminTopicImport'

const defaultFields = {
  insert_chunk_size: 1000,
  dispatch_page_size: 1000,
}

/** Hard ceilings for the current runtime configuration contract. */
export const adminImportsWorkMaxValues = {
  insert_chunk_size: 10000,
  dispatch_page_size: 10000,
}

export const adminImportsWorkConfig = new DynamicConfig({
  key: 'admin-imports-work-config',
  fieldTypes: {
    insert_chunk_size: 'number',
    dispatch_page_size: 'number',
  },
  defaultFields,
})

export function getAdminImportsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(adminImportsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: adminImportsWorkMaxValues[field],
  })
}

export {
  IMPORT_RECOVERY_BATCH_SIZE,
  IMPORT_RECOVERY_CRON,
  IMPORT_RECOVERY_STALE_MS,
} from '@queues/background/enqueues/imports-jobs'
