import { DynamicConfig } from '@data-stores/valkey'

export const requestClientInfoConfig = new DynamicConfig({
  key: 'request-client-info',
  fieldTypes: { enforcement_enabled: 'boolean' },
  defaultFields: { enforcement_enabled: false },
})

export function isRequestClientInfoEnforced(): boolean {
  return requestClientInfoConfig.getFields().enforcement_enabled === true
}
