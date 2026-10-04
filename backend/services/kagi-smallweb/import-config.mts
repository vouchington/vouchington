import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

type KagiSmallWebImportConfig = {
  enabled: boolean
  candidate_batch_size: number
}

const DEFAULTS: KagiSmallWebImportConfig = {
  enabled: false,
  candidate_batch_size: 500,
}

export const kagiSmallWebImportConfig = new DynamicConfig({
  key: 'kagi-smallweb-config',
  fieldTypes: { enabled: 'boolean', candidate_batch_size: 'number' },
  defaultFields: DEFAULTS,
})

export function isKagiSmallWebImportEnabled(): boolean {
  const enabled = kagiSmallWebImportConfig.fields.get('enabled')
  return typeof enabled === 'boolean' ? enabled : DEFAULTS.enabled
}

export function getKagiCandidateBatchSize(): number {
  return getBoundedPositiveIntegerField(kagiSmallWebImportConfig, 'candidate_batch_size', {
    defaultValue: DEFAULTS.candidate_batch_size,
    maxValue: 5000,
  })
}
