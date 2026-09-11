import { DynamicConfig } from '@data-stores/valkey'
import onError from '@modules/on-error'

// reCAPTCHA Enterprise runtime configuration. All three knobs are admin-editable via the Dynamic
// Config API recaptcha-config namespace and audited in dynamic_config_change_logs. We deliberately use a
// DynamicConfig (not a frontend feature flag) because backend behaviour must never be gated by a
// feature flag (see backend/api/CLAUDE.md). `enabled` controls whether we call the paid assessment
// API at all; `blocking_enabled` controls monitor-vs-enforce; `block_threshold` is the score below
// which a request is considered low-trust.
export type RecaptchaConfig = {
  enabled: boolean
  blocking_enabled: boolean
  block_threshold: number
}

const DEFAULTS: RecaptchaConfig = {
  enabled: false,
  blocking_enabled: false,
  block_threshold: 0.5,
}

export const RECAPTCHA_CONFIG_KEY = 'recaptcha-config'

const fieldTypes: Record<keyof RecaptchaConfig, 'boolean' | 'number'> = {
  enabled: 'boolean',
  blocking_enabled: 'boolean',
  block_threshold: 'number',
}

export const recaptchaConfig = new DynamicConfig({
  key: RECAPTCHA_CONFIG_KEY,
  fieldTypes,
  defaultFields: DEFAULTS,
})

export function getRecaptchaConfig(): RecaptchaConfig {
  const fields = recaptchaConfig.getFields()
  const result: RecaptchaConfig = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS) as Array<keyof RecaptchaConfig>) {
    const value = fields[key]
    // Valkey may not have loaded yet (getFields() returns {}) or a single field may be unset —
    // keep the default silently in that case rather than firing onError before initialization.
    if (value === undefined) continue
    if (typeof value === typeof DEFAULTS[key]) {
      ;(result as Record<string, boolean | number>)[key] = value as boolean | number
    } else {
      onError(new Error(`Invalid recaptcha config field ${key}: ${JSON.stringify(value)}`))
    }
  }
  return result
}
