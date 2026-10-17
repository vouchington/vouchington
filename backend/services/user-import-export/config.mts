import { DynamicConfig } from '@data-stores/valkey'
import onError from '@modules/on-error'

export type UserImportExportConfig = {
  sync_export_max_items: number
  /** Largest JSON body, in bytes, the RSS feed import endpoint reads. */
  import_max_body_bytes: number
  /** Pending rows one dispatcher page puts on the queue before it continues. */
  import_dispatch_page_size: number
  /** Rows one INSERT statement writes when an import is submitted. */
  import_insert_chunk_size: number
  /** Rows one page of an import's status lists. */
  import_status_page_size: number
  /** Time one imported feed gets, from Web Risk through both protocol attempts. */
  rss_feed_import_budget_ms: number
}

export const USER_IMPORT_EXPORT_CONFIG_KEY = 'user-import-export-config'

export const DEFAULT_USER_IMPORT_EXPORT_CONFIG: UserImportExportConfig = {
  sync_export_max_items: 1_000,
  import_max_body_bytes: 2 * 1024 * 1024,
  import_dispatch_page_size: 100,
  import_insert_chunk_size: 1_000,
  import_status_page_size: 100,
  rss_feed_import_budget_ms: 15_000,
}

export const USER_IMPORT_EXPORT_MIN_VALUES: UserImportExportConfig = {
  sync_export_max_items: 1,
  import_max_body_bytes: 1_024,
  import_dispatch_page_size: 1,
  import_insert_chunk_size: 1,
  import_status_page_size: 1,
  rss_feed_import_budget_ms: 1_000,
}

// The budget stays below the worker's default lock, so a row that spends all of it still finishes
// before its lock expires.
export const USER_IMPORT_EXPORT_MAX_VALUES: UserImportExportConfig = {
  sync_export_max_items: 50_000,
  import_max_body_bytes: 16 * 1024 * 1024,
  import_dispatch_page_size: 1_000,
  import_insert_chunk_size: 10_000,
  import_status_page_size: 1_000,
  rss_feed_import_budget_ms: 25_000,
}

const fieldTypes: Record<keyof UserImportExportConfig, 'number'> = {
  sync_export_max_items: 'number',
  import_max_body_bytes: 'number',
  import_dispatch_page_size: 'number',
  import_insert_chunk_size: 'number',
  import_status_page_size: 'number',
  rss_feed_import_budget_ms: 'number',
}

export const userImportExportConfig = new DynamicConfig({
  key: USER_IMPORT_EXPORT_CONFIG_KEY,
  fieldTypes,
  defaultFields: DEFAULT_USER_IMPORT_EXPORT_CONFIG,
})

export function getUserImportExportConfig(): UserImportExportConfig {
  const fields = userImportExportConfig.getFields() ?? {}
  const result = { ...DEFAULT_USER_IMPORT_EXPORT_CONFIG }
  for (const key of Object.keys(DEFAULT_USER_IMPORT_EXPORT_CONFIG) as Array<
    keyof UserImportExportConfig
  >) {
    const value = fields[key]
    if (value === undefined) continue
    if (
      Number.isInteger(value) &&
      (value as number) >= USER_IMPORT_EXPORT_MIN_VALUES[key] &&
      (value as number) <= USER_IMPORT_EXPORT_MAX_VALUES[key]
    ) {
      result[key] = value as number
    } else {
      onError(new Error(`Invalid user import/export config field ${key}: ${JSON.stringify(value)}`))
    }
  }
  return result
}
