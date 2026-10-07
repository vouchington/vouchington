import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { calculateVoteWeight, type VoteWeightFactors } from './calculate.mts'
import { IDENTITY_VERIFIED_VOTE_WEIGHT_BONUS } from '@voucha/config'
import { getVoteWeightConfig } from './config.mts'

const referenceTime = new Date('2026-01-01T00:00:00.000Z')
const daysAgo = (n: number) => new Date(referenceTime.getTime() - n * 24 * 60 * 60 * 1000)
const yearsAgo = (n: number) => daysAgo(n * 365)

// Use 8-day-old account as base: past the 7-day minimal-weight window, before the 30-day multiplier
function baseFactors(): VoteWeightFactors {
  return {
    distinctAuthMethodCount: 0,
    oauthCount: 0,
    oauthOlderThan1Year: 0,
    oauthOlderThan5Years: 0,
    accountCreatedAt: daysAgo(8),
    membershipPlan: null,
    isAdmin: false,
    penaltyMultiplier: 1,
    isIdentityVerified: false,
  }
}

describe('calculateVoteWeight', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(process.env.VOUCH_PROOF_NOW ?? '2030-01-01T00:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it.each([
    [7 * 86_400_000 - 1, getVoteWeightConfig().weight_new_account],
    [7 * 86_400_000, 1],
    [7 * 86_400_000 + 1, 1],
    [30 * 86_400_000 - 1, 1],
    [30 * 86_400_000, getVoteWeightConfig().multiplier_account_30_days],
    [30 * 86_400_000 + 1, getVoteWeightConfig().multiplier_account_30_days],
  ])('applies age thresholds at exactly %i milliseconds', (ageMs, expected) => {
    const factors = {
      ...baseFactors(),
      accountCreatedAt: new Date(referenceTime.getTime() - ageMs),
    }
    expect(calculateVoteWeight(factors, referenceTime)).toBe(expected)
  })

  it('does not apply the under-seven-day minimal-weight penalty to identity-verified free users', () => {
    const factors = {
      ...baseFactors(),
      accountCreatedAt: daysAgo(1),
      isIdentityVerified: true,
      membershipPlan: null,
    }
    expect(calculateVoteWeight(factors, referenceTime)).toBeGreaterThan(
      getVoteWeightConfig().weight_new_account,
    )
  })
  it('base case: no auth methods, no age thresholds, no subscription → weight = 1.0', () => {
    const weight = calculateVoteWeight(baseFactors(), referenceTime)
    expect(weight).toBe(1.0)
  })

  it('gives minimal weight to accounts < 7 days old without membership', () => {
    const { weight_new_account } = getVoteWeightConfig()
    const factors = { ...baseFactors(), accountCreatedAt: daysAgo(1) }
    expect(calculateVoteWeight(factors, referenceTime)).toBe(weight_new_account)
  })

  it('gives same minimal weight regardless of account age within 7 days', () => {
    const { weight_new_account } = getVoteWeightConfig()
    const day1 = calculateVoteWeight(
      { ...baseFactors(), accountCreatedAt: daysAgo(1) },
      referenceTime,
    )
    const day6 = calculateVoteWeight(
      { ...baseFactors(), accountCreatedAt: daysAgo(6) },
      referenceTime,
    )
    expect(day1).toBe(weight_new_account)
    expect(day6).toBe(weight_new_account)
  })

  it('minimal new account weight is greater than 0', () => {
    const factors = { ...baseFactors(), accountCreatedAt: daysAgo(1) }
    expect(calculateVoteWeight(factors, referenceTime)).toBeGreaterThan(0)
  })

  it('paid membership bypasses minimal weight gate for accounts < 7 days old', () => {
    const { weight_new_account } = getVoteWeightConfig()
    const factors = {
      ...baseFactors(),
      accountCreatedAt: daysAgo(1),
      membershipPlan: 'plus' as const,
    }
    expect(calculateVoteWeight(factors, referenceTime)).toBeGreaterThan(weight_new_account)
  })

  it('admin role bypasses minimal weight gate for accounts < 7 days old', () => {
    const { weight_new_account } = getVoteWeightConfig()
    const factors = { ...baseFactors(), accountCreatedAt: daysAgo(1), isAdmin: true }
    expect(calculateVoteWeight(factors, referenceTime)).toBeGreaterThan(weight_new_account)
  })

  it('identity verification bypasses minimal weight gate for accounts < 7 days old', () => {
    const { weight_new_account } = getVoteWeightConfig()
    const factors = { ...baseFactors(), accountCreatedAt: daysAgo(1), isIdentityVerified: true }
    expect(calculateVoteWeight(factors, referenceTime)).toBeGreaterThan(weight_new_account)
  })

  it('penalty multiplier applies to new account minimal weight', () => {
    const { weight_new_account } = getVoteWeightConfig()
    const factors = {
      ...baseFactors(),
      accountCreatedAt: daysAgo(1),
      penaltyMultiplier: 0.5,
    }
    expect(calculateVoteWeight(factors, referenceTime)).toBeCloseTo(weight_new_account * 0.5, 10)
  })

  it('MFA only: distinctAuthMethodCount=2 → weight = 1.0 * multiplier_mfa', () => {
    const { multiplier_mfa } = getVoteWeightConfig()
    const factors = { ...baseFactors(), distinctAuthMethodCount: 2 }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(1.0 * multiplier_mfa)
  })

  it('has OAuth: oauthCount=1 → weight = multiplier_has_oauth', () => {
    const { multiplier_has_oauth } = getVoteWeightConfig()
    const factors = { ...baseFactors(), oauthCount: 1 }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(multiplier_has_oauth)
  })

  it('2+ OAuth: oauthCount=2 → has_oauth * 2_plus_oauth', () => {
    const { multiplier_has_oauth, multiplier_2_plus_oauth } = getVoteWeightConfig()
    const factors = { ...baseFactors(), oauthCount: 2 }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(multiplier_has_oauth * multiplier_2_plus_oauth)
  })

  it('OAuth 1yr: oauthOlderThan1Year=2 → multiplied by multiplier_oauth_1_year', () => {
    const { multiplier_oauth_1_year } = getVoteWeightConfig()
    const factors = { ...baseFactors(), oauthOlderThan1Year: 2 }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(multiplier_oauth_1_year)
  })

  it('OAuth 5yr stacks with 1yr: oauthOlderThan5Years=2, oauthOlderThan1Year=2 → 1yr * 5yr', () => {
    const { multiplier_oauth_1_year, multiplier_oauth_5_years } = getVoteWeightConfig()
    const factors = { ...baseFactors(), oauthOlderThan1Year: 2, oauthOlderThan5Years: 2 }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(multiplier_oauth_1_year * multiplier_oauth_5_years)
  })

  it('OAuth 5yr without 1yr meeting threshold: only 5yr applies', () => {
    const { multiplier_oauth_5_years } = getVoteWeightConfig()
    const factors = { ...baseFactors(), oauthOlderThan5Years: 2, oauthOlderThan1Year: 1 }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(multiplier_oauth_5_years)
  })

  it('account 30 days: accountCreatedAt = 31 days ago → 2x', () => {
    const { multiplier_account_30_days } = getVoteWeightConfig()
    const factors = { ...baseFactors(), accountCreatedAt: daysAgo(31) }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(multiplier_account_30_days)
  })

  it('account all thresholds: 5+ year old account → 2*2*2*2 = 16x', () => {
    const {
      multiplier_account_30_days,
      multiplier_account_1_year,
      multiplier_account_2_years,
      multiplier_account_5_years,
    } = getVoteWeightConfig()
    const factors = { ...baseFactors(), accountCreatedAt: yearsAgo(6) }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(
      multiplier_account_30_days *
        multiplier_account_1_year *
        multiplier_account_2_years *
        multiplier_account_5_years,
    )
  })

  it('plus subscription: multiplier_plus', () => {
    const { multiplier_plus } = getVoteWeightConfig()
    const factors = { ...baseFactors(), membershipPlan: 'plus' as const }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(multiplier_plus)
  })

  it('pro subscription: 200x', () => {
    const { multiplier_pro } = getVoteWeightConfig()
    const factors = { ...baseFactors(), membershipPlan: 'pro' as const }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(multiplier_pro)
  })

  it('admin: 10000x (overrides subscription)', () => {
    const { multiplier_admin } = getVoteWeightConfig()
    const factors = { ...baseFactors(), isAdmin: true }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(multiplier_admin)
  })

  it('admin with subscription: admin takes precedence over subscription plan', () => {
    const { multiplier_admin } = getVoteWeightConfig()
    const factors = { ...baseFactors(), isAdmin: true, membershipPlan: 'pro' as const }
    const adminWeight = calculateVoteWeight(factors, referenceTime)
    const proOnlyFactors = { ...baseFactors(), isAdmin: false, membershipPlan: 'pro' as const }
    const proWeight = calculateVoteWeight(proOnlyFactors, referenceTime)
    // Admin takes precedence: uses multiplier_admin not multiplier_pro
    expect(adminWeight).toBe(multiplier_admin)
    expect(adminWeight).not.toBe(proWeight)
  })

  it('all multipliers stacked: MFA + 2 OAuth + 1yr OAuth + old account + pro', () => {
    const {
      multiplier_mfa,
      multiplier_has_oauth,
      multiplier_2_plus_oauth,
      multiplier_oauth_1_year,
      multiplier_account_30_days,
      multiplier_pro,
    } = getVoteWeightConfig()
    const factors: VoteWeightFactors = {
      distinctAuthMethodCount: 2,
      oauthCount: 2,
      oauthOlderThan1Year: 2,
      oauthOlderThan5Years: 0,
      accountCreatedAt: daysAgo(40),
      membershipPlan: 'pro',
      isAdmin: false,
      penaltyMultiplier: 1,
      isIdentityVerified: false,
    }
    const weight = calculateVoteWeight(factors, referenceTime)
    const expected =
      1.0 *
      multiplier_mfa *
      multiplier_has_oauth *
      multiplier_2_plus_oauth *
      multiplier_oauth_1_year *
      multiplier_account_30_days *
      multiplier_pro
    expect(weight).toBeCloseTo(expected, 10)
  })

  it('penalty 0.2 reduces weight by 80%', () => {
    const factors = { ...baseFactors(), penaltyMultiplier: 0.2 }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBeCloseTo(0.2, 10)
  })

  it('multiple penalties stack multiplicatively: penaltyMultiplier 0.25 reduces weight by 75%', () => {
    const factors = { ...baseFactors(), penaltyMultiplier: 0.25 }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBeCloseTo(0.25, 10)
  })

  it('penalty 1.0 has no effect on weight', () => {
    const factors = { ...baseFactors(), penaltyMultiplier: 1.0 }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBe(1.0)
  })

  it('brand new account (now) gets minimal weight: covers COALESCE fallback for non-UUIDv7 users', () => {
    const { weight_new_account } = getVoteWeightConfig()
    const factors = { ...baseFactors(), accountCreatedAt: referenceTime }
    expect(calculateVoteWeight(factors, referenceTime)).toBe(weight_new_account)
  })

  it('identity-verified bonus adds IDENTITY_VERIFIED_VOTE_WEIGHT_BONUS to weight', () => {
    const baseWeight = calculateVoteWeight(baseFactors(), referenceTime)
    const verifiedWeight = calculateVoteWeight(
      { ...baseFactors(), isIdentityVerified: true },
      referenceTime,
    )
    expect(verifiedWeight).toBeCloseTo(baseWeight + IDENTITY_VERIFIED_VOTE_WEIGHT_BONUS, 10)
  })

  it('identity-verified bonus is not applied when isIdentityVerified is false', () => {
    const baseWeight = calculateVoteWeight(baseFactors(), referenceTime)
    const unverifiedWeight = calculateVoteWeight(
      { ...baseFactors(), isIdentityVerified: false },
      referenceTime,
    )
    expect(unverifiedWeight).toBe(baseWeight)
  })

  it('identity-verified bonus applies after penalty multiplier', () => {
    const baseWeight = calculateVoteWeight(baseFactors(), referenceTime)
    const factors = { ...baseFactors(), penaltyMultiplier: 0.5, isIdentityVerified: true }
    const weight = calculateVoteWeight(factors, referenceTime)
    expect(weight).toBeCloseTo(baseWeight * 0.5 + IDENTITY_VERIFIED_VOTE_WEIGHT_BONUS, 10)
  })
})
