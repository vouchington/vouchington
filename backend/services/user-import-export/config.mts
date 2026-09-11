import { DynamicConfig } from '@data-stores/valkey'
import onError from '@modules/on-error'

export type UserImportExportConfig = {
  sync_export_max_items: number
}

export const USER_IMPORT_EXPORT_CONFIG_KEY = 'user-import-export-config'

export const DEFAULT_USER_IMPORT_EXPORT_CONFIG: UserImportExportConfig = {
  sync_export_max_items: 1_000,
}

export const USER_IMPORT_EXPORT_MIN_VALUES: UserImportExportConfig = {
  sync_export_max_items: 1,
}

export const USER_IMPORT_EXPORT_MAX_VALUES: UserImportExportConfig = {
  sync_export_max_items: 50_000,
}

const fieldTypes: Record<keyof UserImportExportConfig, 'number'> = {
  sync_export_max_items: 'number',
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
