import { DynamicConfig } from '@data-stores/valkey'

export type WebRiskConfig = {
  enabled: boolean
}

const DEFAULTS: WebRiskConfig = {
  enabled: false,
}

export const webRiskConfig = new DynamicConfig({
  key: 'web-risk-config',
  fieldTypes: {
    enabled: 'boolean',
  },
  defaultFields: DEFAULTS,
})

export function isWebRiskEnabled(): boolean {
  const enabled = webRiskConfig.fields.get('enabled')
  return typeof enabled === 'boolean' ? enabled : DEFAULTS.enabled
}
