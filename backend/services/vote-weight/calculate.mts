import { getVoteWeightConfig } from './config.mts'
import { IDENTITY_VERIFIED_VOTE_WEIGHT_BONUS } from '@voucha/config'

export type VoteWeightFactors = {
  distinctAuthMethodCount: number // email(1) + phone(1) + passkey(1) + each OAuth provider(1)
  oauthCount: number // number of distinct OAuth providers connected
  oauthOlderThan1Year: number // OAuth providers connected > 1 year ago
  oauthOlderThan5Years: number // OAuth providers connected > 5 years ago
  accountCreatedAt: Date // from users table
  membershipPlan: 'plus' | 'pro' | null
  isAdmin: boolean // has administrator role
  penaltyMultiplier: number // product of active vote_weight_penalties (1.0 = no penalty)
  isIdentityVerified: boolean // government-ID verified via Stripe Identity
}

export function calculateVoteWeight(factors: VoteWeightFactors): number {
  const cfg = getVoteWeightConfig()
  const ageMs = Date.now() - factors.accountCreatedAt.getTime()

  // Minimal weight for accounts < 7 days without paid membership or admin status.
  // Penalty still applies so active penalties reduce even this minimal weight.
  if (
    ageMs < cfg.threshold_7_days_ms &&
    !factors.isAdmin &&
    !factors.membershipPlan &&
    !factors.isIdentityVerified
  ) {
    return cfg.weight_new_account * factors.penaltyMultiplier
  }

  let weight = 1.0

  // Auth multipliers
  if (factors.distinctAuthMethodCount >= 2) weight *= cfg.multiplier_mfa
  if (factors.oauthCount >= 1) weight *= cfg.multiplier_has_oauth
  if (factors.oauthCount >= 2) weight *= cfg.multiplier_2_plus_oauth
  if (factors.oauthOlderThan1Year >= 2) weight *= cfg.multiplier_oauth_1_year
  if (factors.oauthOlderThan5Years >= 2) weight *= cfg.multiplier_oauth_5_years

  // Account age multipliers (stacking)
  if (ageMs >= cfg.threshold_30_days_ms) weight *= cfg.multiplier_account_30_days
  if (ageMs >= cfg.threshold_1_year_ms) weight *= cfg.multiplier_account_1_year
  if (ageMs >= cfg.threshold_2_years_ms) weight *= cfg.multiplier_account_2_years
  if (ageMs >= cfg.threshold_5_years_ms) weight *= cfg.multiplier_account_5_years

  // Subscription multiplier — only highest applies
  if (factors.isAdmin) {
    weight *= cfg.multiplier_admin
  } else if (factors.membershipPlan === 'pro') {
    weight *= cfg.multiplier_pro
  } else if (factors.membershipPlan === 'plus') {
    weight *= cfg.multiplier_plus
  }

  weight *= factors.penaltyMultiplier

  // Identity-verified additive bonus (applied after all multipliers)
  if (factors.isIdentityVerified) {
    weight += IDENTITY_VERIFIED_VOTE_WEIGHT_BONUS
  }

  return weight
}
