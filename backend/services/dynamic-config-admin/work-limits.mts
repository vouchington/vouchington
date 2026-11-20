import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  namespace_history_rows: 50,
}

/** Hard ceilings for the current runtime configuration contract. */
export const dynamicConfigAdminWorkMaxValues = {
  namespace_history_rows: 500,
}

export const dynamicConfigAdminWorkConfig = new DynamicConfig({
  key: 'dynamic-config-admin-work-config',
  fieldTypes: {
    namespace_history_rows: 'number',
  },
  defaultFields,
})

export function getDynamicConfigAdminWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(dynamicConfigAdminWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: dynamicConfigAdminWorkMaxValues[field],
  })
}
