import { DynamicConfig } from '@data-stores/valkey'
import onError from '@modules/on-error'

export type VoteWeightConfig = {
  // auth multipliers
  multiplier_mfa: number
  multiplier_has_oauth: number
  multiplier_2_plus_oauth: number
  multiplier_oauth_1_year: number
  multiplier_oauth_5_years: number
  // account-age stacking multipliers
  multiplier_account_30_days: number
  multiplier_account_1_year: number
  multiplier_account_2_years: number
  multiplier_account_5_years: number
  // base weight for accounts < 7 days
  weight_new_account: number
  // age thresholds in milliseconds
  threshold_7_days_ms: number
  threshold_30_days_ms: number
  threshold_1_year_ms: number
  threshold_2_years_ms: number
  threshold_5_years_ms: number
  // subscription multipliers (only highest applies)
  multiplier_plus: number
  multiplier_pro: number
  multiplier_admin: number
}

const DEFAULTS: VoteWeightConfig = {
  multiplier_mfa: 1.5,
  multiplier_has_oauth: 1.5,
  multiplier_2_plus_oauth: 2,
  multiplier_oauth_1_year: 1.5,
  multiplier_oauth_5_years: 3,
  multiplier_account_30_days: 2,
  multiplier_account_1_year: 2,
  multiplier_account_2_years: 2,
  multiplier_account_5_years: 2,
  weight_new_account: 0.01,
  threshold_7_days_ms: 7 * 24 * 60 * 60 * 1000,
  threshold_30_days_ms: 30 * 24 * 60 * 60 * 1000,
  threshold_1_year_ms: 365 * 24 * 60 * 60 * 1000,
  threshold_2_years_ms: 2 * 365 * 24 * 60 * 60 * 1000,
  threshold_5_years_ms: 5 * 365 * 24 * 60 * 60 * 1000,
  multiplier_plus: 50,
  multiplier_pro: 200,
  multiplier_admin: 10_000,
}

export const VOTE_WEIGHT_CONFIG_KEY = 'vote-weight-config'

const fieldTypes: Record<keyof VoteWeightConfig, 'number'> = {
  multiplier_mfa: 'number',
  multiplier_has_oauth: 'number',
  multiplier_2_plus_oauth: 'number',
  multiplier_oauth_1_year: 'number',
  multiplier_oauth_5_years: 'number',
  multiplier_account_30_days: 'number',
  multiplier_account_1_year: 'number',
  multiplier_account_2_years: 'number',
  multiplier_account_5_years: 'number',
  weight_new_account: 'number',
  threshold_7_days_ms: 'number',
  threshold_30_days_ms: 'number',
  threshold_1_year_ms: 'number',
  threshold_2_years_ms: 'number',
  threshold_5_years_ms: 'number',
  multiplier_plus: 'number',
  multiplier_pro: 'number',
  multiplier_admin: 'number',
}

export const voteWeightConfig = new DynamicConfig({
  key: VOTE_WEIGHT_CONFIG_KEY,
  fieldTypes,
  defaultFields: DEFAULTS,
})

export function getVoteWeightConfig(): VoteWeightConfig {
  const fields = voteWeightConfig.getFields()
  // If Valkey hasn't loaded yet, getFields() returns {}. Return DEFAULTS silently
  // rather than firing onError for all 18 keys before initialization completes.
  if (Object.keys(fields).length === 0) return { ...DEFAULTS }
  const result: VoteWeightConfig = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS) as Array<keyof VoteWeightConfig>) {
    const value = fields[key]
    if (typeof value === 'number' && value > 0) {
      result[key] = value
    } else {
      onError(new Error(`Invalid vote weight config field ${key}: ${JSON.stringify(value)}`))
    }
  }
  return result
}
