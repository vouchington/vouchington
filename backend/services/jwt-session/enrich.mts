import type { SessionTokenPayload } from './types.mts'
import { sessionReloginRequired } from './device-authority.mts'
import { filterSessionRoles } from './assurance.mts'
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
export async function getEnrichedSessionClaims(
  user: PrivateUser,
  assurance: { mfaVerifiedAt?: number } = {},
): Promise<EnrichedSessionClaims> {
  const context = await getUserRateLimitContext(user.id)
  const trustTier = computeTrustTier(user, context)

  return {
    roles: filterSessionRoles(user.roles, assurance.mfaVerifiedAt),
    membershipPlan: context.membershipPlan,
    membershipExpiresAt: context.membershipExpiresAt ?? null,
    trustTier,
    suspended: !!user.suspended_at,
    uiLocale: user.ui_locale ?? null,
  }
}

/** Request caches carry the same original proof as the strictly paired signed credentials. */
export function getSessionAuthorizedUser(
  user: PrivateUser,
  assurance: { mfaVerifiedAt?: number },
): PrivateUser {
  return { ...user, roles: filterSessionRoles(user.roles, assurance.mfaVerifiedAt) }
}

/** Acting-user responses describe exactly the authority of the newly issued signed access token. */
export function getSessionResponseUser(
  user: PrivateUser,
  session: Pick<SessionTokenPayload, 'uid' | 'rol' | 'mfa_at'>,
): PrivateUser {
  if (session.uid !== user.id) throw sessionReloginRequired()
  return getSessionAuthorizedUser(
    { ...user, roles: session.rol ?? [] },
    { mfaVerifiedAt: session.mfa_at },
  )
}
