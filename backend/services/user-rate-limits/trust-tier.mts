import { getDateFromUUIDv7 } from '@modules/utils/ids'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { TrustTierContext } from './types.mts'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

// Penalty applied when a confirmed bad-faith reporter penalty is active.
export const BAD_FAITH_REPORTER_PENALTY = 2

export function hasOAuthAccount(user: PrivateUser): boolean {
  return !!(
    user.facebook_account ||
    user.apple_account ||
    user.google_account ||
    user.x_account ||
    user.linkedin_account ||
    user.microsoft_account ||
    user.github_account
  )
}

export function getAccountAgeMs(user: PrivateUser): number {
  const createdAt = getDateFromUUIDv7(user.id)
  // Non-UUIDv7 IDs (e.g. seeded test fixtures with all-zero UUIDs) carry no
  // timestamp. Treat them as ancient accounts so age gates do not block them.
  if (!createdAt) return Number.POSITIVE_INFINITY
  return Date.now() - createdAt.getTime()
}

export function computeTrustTier(user: PrivateUser, context: TrustTierContext): number {
  if (user.roles.includes('administrator')) return 5
  if (getAccountAgeMs(user) < TWENTY_FOUR_HOURS_MS) return 0

  let score = 1

  // Auth method bonus
  if (hasOAuthAccount(user)) score += 1

  // Account age bonuses (highest applicable)
  const ageMs = getAccountAgeMs(user)
  if (ageMs > ONE_YEAR_MS) {
    score += 1.5
  } else if (ageMs > SIX_MONTHS_MS) {
    score += 1
  } else if (ageMs > THIRTY_DAYS_MS) {
    score += 0.5
  }

  // Membership bonuses
  if (context.membershipPlan === 'pro') {
    score += 1.5
  } else if (context.membershipPlan === 'plus') {
    score += 1
  }

  // Identity verification bonus
  if (user.verification_status === 'verified') {
    score += 1
  }

  // Bad-faith reporter penalty: applied when an active report-abuse penalty exists.
  // The bad_faith_reporter_at timestamp is set by applyReportAbusePenalty and cleared
  // by revokeReportAbusePenalty once all penalties are revoked.
  if (user.bad_faith_reporter_at != null) {
    score -= BAD_FAITH_REPORTER_PENALTY
  }

  return Math.min(5, Math.max(0, Math.floor(score)))
}
