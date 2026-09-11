import { getUserRateLimitContext } from '@services/user-rate-limits/context'
import { computeTrustTier } from '@services/user-rate-limits/trust-tier'
import type { PrivateUser } from '@voucha/types/entities/user'

export type EnrichedSessionClaims = {
  roles: readonly string[]
  membershipPlan: string | null
  membershipExpiresAt: Date | null
  trustTier: number
  suspended: boolean
  uiLocale: string | null
}

// Accepts an already-fetched user instead of a bare userId so this service never depends on
// @services/users (that dependency would recreate a users<->jwt-session workspace cycle).
// Callers that only hold a userId must fetch the user themselves before calling this.
export async function getEnrichedSessionClaims(user: PrivateUser): Promise<EnrichedSessionClaims> {
  const context = await getUserRateLimitContext(user.id)
  const trustTier = computeTrustTier(user, context)

  return {
    roles: user.roles,
    membershipPlan: context.membershipPlan,
    membershipExpiresAt: context.membershipExpiresAt ?? null,
    trustTier,
    suspended: !!user.suspended_at,
    uiLocale: user.ui_locale ?? null,
  }
}
