import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const LIST_IMPORT_CONFIG_KEY = 'list-import-config'
export const LIST_IMPORT_MAX_ITEMS = 500

export const listImportConfig = new DynamicConfig({
  key: LIST_IMPORT_CONFIG_KEY,
  fieldTypes: { max_items: 'number' },
  defaultFields: { max_items: LIST_IMPORT_MAX_ITEMS },
})

export function getListImportLimit(): number {
  return getBoundedPositiveIntegerField(listImportConfig, 'max_items', {
    defaultValue: LIST_IMPORT_MAX_ITEMS,
    maxValue: LIST_IMPORT_MAX_ITEMS,
  })
}
