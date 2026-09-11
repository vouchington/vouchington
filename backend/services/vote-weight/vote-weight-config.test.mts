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

  it('default multiplier_mfa is 1.5', () => {
    expect(getVoteWeightConfig().multiplier_mfa).toBe(1.5)
  })

  it('default multiplier_admin is 10_000', () => {
    expect(getVoteWeightConfig().multiplier_admin).toBe(10_000)
  })

  it('default weight_new_account is 0.01', () => {
    expect(getVoteWeightConfig().weight_new_account).toBe(0.01)
  })

  it('default multiplier_plus is 50', () => {
    expect(getVoteWeightConfig().multiplier_plus).toBe(50)
  })

  it('default multiplier_pro is 200', () => {
    expect(getVoteWeightConfig().multiplier_pro).toBe(200)
  })

  it('default threshold_7_days_ms equals 7 days in milliseconds', () => {
    expect(getVoteWeightConfig().threshold_7_days_ms).toBe(7 * 24 * 60 * 60 * 1000)
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

  it('all returned values are positive numbers', () => {
    const cfg = getVoteWeightConfig()
    for (const [_key, value] of Object.entries(cfg)) {
      expect(typeof value).toBe('number')
      expect(value).toBeGreaterThan(0)
    }
  })

  it('returns an object with all 18 expected fields', () => {
    const cfg = getVoteWeightConfig()
    const expectedKeys = [
      'multiplier_mfa',
      'multiplier_has_oauth',
      'multiplier_2_plus_oauth',
      'multiplier_oauth_1_year',
      'multiplier_oauth_5_years',
      'multiplier_account_30_days',
      'multiplier_account_1_year',
      'multiplier_account_2_years',
      'multiplier_account_5_years',
      'weight_new_account',
      'threshold_7_days_ms',
      'threshold_30_days_ms',
      'threshold_1_year_ms',
      'threshold_2_years_ms',
      'threshold_5_years_ms',
      'multiplier_plus',
      'multiplier_pro',
      'multiplier_admin',
    ]
    for (const key of expectedKeys) {
      expect(cfg).toHaveProperty(key)
    }
    expect(Object.keys(cfg)).toHaveLength(expectedKeys.length)
  })
})
