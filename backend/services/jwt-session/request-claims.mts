import { filterSessionRoles } from './assurance.mts'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getJwtStaleKey } from '@data-stores/valkey/jwt-stale'
import type { PrivateUser } from '@voucha/types/entities/user'
import { getEnrichedSessionClaims, getSessionAuthorizedUser } from './enrich.mts'
import type { FetchUserForSession, VerifyDeviceAndSessionTokenResult } from './types.mts'

/** Derive fresh request-local claims without issuing tokens or consuming a stale marker. */
export async function resolveRequestSessionClaims(
  verified: VerifyDeviceAndSessionTokenResult,
  fetchUser: FetchUserForSession,
  clock: () => number = Date.now,
): Promise<{ session: VerifyDeviceAndSessionTokenResult | null; user?: PrivateUser | null }> {
  if (!verified.uid) return { session: verified }
  const session = {
    ...verified,
    ...(verified.rol !== undefined && { rol: filterSessionRoles(verified.rol, verified.mfa_at) }),
  }
  const now = Math.floor(clock() / 1000)
  const membershipExpired = verified.mpe !== undefined && now >= verified.mpe
  if (
    verified.sca !== undefined &&
    now < verified.sca &&
    verified.rca !== undefined &&
    now < verified.rca &&
    !membershipExpired
  )
    return { session }
  const stale = await sessionValkeyClient.get(getJwtStaleKey(verified.uid))
  if (stale === null && verified.rca !== undefined && now < verified.rca && !membershipExpired)
    return { session }
  const user = await fetchUser(verified.uid)
  if (!user || user.id !== verified.uid) return { session: null, user: null }
  const assurance = { mfaVerifiedAt: verified.mfa_at }
  const claims = await getEnrichedSessionClaims(user, assurance)
  return {
    session: {
      ...verified,
      rol: claims.roles,
      mpl: claims.membershipPlan,
      mpe: claims.membershipExpiresAt
        ? Math.floor(claims.membershipExpiresAt.getTime() / 1000)
        : undefined,
      tt: claims.trustTier,
      uil: claims.uiLocale ?? undefined,
    },
    user: getSessionAuthorizedUser(user, assurance),
  }
}
