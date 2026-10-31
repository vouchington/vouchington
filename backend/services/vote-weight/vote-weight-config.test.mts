import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { describe, it, expect } from 'vitest'
import { getVoteWeightConfig, voteWeightConfig } from './config.mts'

describe('getVoteWeightConfig', () => {
  it('returns default values when no overrides are set', () => {
    const cfg = getVoteWeightConfig()
    expect(cfg).toMatchObject({
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
    })
  })

  it('falls back to DEFAULTS and logs error for invalid (negative) field values', async () => {
    overrideDynamicConfigFieldsForTest(voteWeightConfig, { multiplier_mfa: -1 })
    try {
      const cfg = getVoteWeightConfig()
      expect(cfg.multiplier_mfa).toBe(1.5)
    } finally {
      overrideDynamicConfigFieldsForTest(voteWeightConfig, { multiplier_mfa: 1.5 })
    }
  })
})
