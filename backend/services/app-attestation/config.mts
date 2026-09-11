import { DynamicConfig } from '@data-stores/valkey'

export type RequestSigningMode = 'off' | 'observe' | 'enforce'

export type AppAttestationConfig = {
  enabled: boolean
  require_attestation_for_bypass: boolean
  allow_development_attestation: boolean
  request_signing_mode: string
}

const DEFAULTS: AppAttestationConfig = {
  enabled: false,
  require_attestation_for_bypass: false,
  allow_development_attestation: false,
  request_signing_mode: 'off',
}

export const appAttestationConfig = new DynamicConfig({
  key: 'app-attestation-config',
  fieldTypes: {
    enabled: 'boolean',
    require_attestation_for_bypass: 'boolean',
    allow_development_attestation: 'boolean',
    request_signing_mode: 'string',
  },
  defaultFields: DEFAULTS,
})

export function isAppAttestationEnabled(): boolean {
  const enabled = appAttestationConfig.fields.get('enabled')
  return typeof enabled === 'boolean' ? enabled : DEFAULTS.enabled
}

export function isAttestationRequiredForBypass(): boolean {
  const required = appAttestationConfig.fields.get('require_attestation_for_bypass')
  return typeof required === 'boolean' ? required : DEFAULTS.require_attestation_for_bypass
}

export function isDevelopmentAttestationAllowed(): boolean {
  const allowed = appAttestationConfig.fields.get('allow_development_attestation')
  return typeof allowed === 'boolean' ? allowed : DEFAULTS.allow_development_attestation
}

const VALID_SIGNING_MODES = new Set<RequestSigningMode>(['off', 'observe', 'enforce'])

export function getRequestSigningMode(): RequestSigningMode {
  const value = appAttestationConfig.fields.get('request_signing_mode')
  if (typeof value === 'string' && VALID_SIGNING_MODES.has(value as RequestSigningMode)) {
    return value as RequestSigningMode
  }
  return DEFAULTS.request_signing_mode as RequestSigningMode
}

export function getAppleAppAttestTeamId(): string {
  const teamId = process.env.APPLE_APP_ATTEST_TEAM_ID
  if (!teamId) throw new Error('APPLE_APP_ATTEST_TEAM_ID is not set')
  return teamId
}

export function getAppleAppAttestBundleId(): string {
  const bundleId = process.env.APPLE_APP_ATTEST_BUNDLE_ID
  if (!bundleId) throw new Error('APPLE_APP_ATTEST_BUNDLE_ID is not set')
  return bundleId
}
