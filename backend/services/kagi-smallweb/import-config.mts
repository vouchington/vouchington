import { DynamicConfig } from '@data-stores/valkey'

type KagiSmallWebImportConfig = {
  enabled: boolean
}

const DEFAULTS: KagiSmallWebImportConfig = {
  enabled: false,
}

export const kagiSmallWebImportConfig = new DynamicConfig({
  key: 'kagi-smallweb-config',
  fieldTypes: { enabled: 'boolean' },
  defaultFields: DEFAULTS,
})

export function isKagiSmallWebImportEnabled(): boolean {
  const enabled = kagiSmallWebImportConfig.fields.get('enabled')
  return typeof enabled === 'boolean' ? enabled : DEFAULTS.enabled
}
