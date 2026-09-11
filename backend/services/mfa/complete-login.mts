import createHttpError from 'http-errors'
import {
  createDeviceAndSessionTokens,
  getEnrichedSessionClaims,
  type DeviceClass,
  type DeviceContext,
} from '@services/jwt-session'
import type { LoginAttempt } from './login-attempt.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

export type CompletedMfaLogin = {
  userId: string
  deviceClass?: DeviceClass
  deviceToken: { token: string; payload: { did: string; dc?: DeviceClass } }
  sessionToken: {
    token: string
    payload: {
      did: string
      sid: string
      uid: string | null
      rol?: readonly string[]
      mpl?: string | null
      tt?: number
      rca?: number
      sca?: number
    }
  }
}

// `deviceClass` comes from the login attempt itself, captured when it was created for that
// same deviceId/sessionId -- never re-derived from whatever session happens to be attached to
// the request that completes MFA, since that request can come from a different device than the
// one that started the login.
//
// `user` is fetched by the caller (a backend/api route) instead of by this service, so
// @services/mfa never depends on @services/users (that dependency would recreate a
// users<->mfa workspace cycle, since @services/users already depends on @services/mfa).
export async function completeMfaLoginWithContext(
  attempt: LoginAttempt,
  user: PrivateUser | null,
  deviceContext?: DeviceContext,
): Promise<CompletedMfaLogin> {
  const claims = user ? await getEnrichedSessionClaims(user) : null
  if (claims?.suspended) throw createHttpError(403, 'Account suspended')
  const tokens = await createDeviceAndSessionTokens({
    did: attempt.deviceId,
    uid: attempt.userId,
    roles: claims?.roles,
    membershipPlan: claims?.membershipPlan,
    membershipExpiresAt: claims?.membershipExpiresAt,
    trustTier: claims?.trustTier,
    uiLocale: claims?.uiLocale,
    deviceClass: attempt.deviceClass,
    deviceContext,
  })
  return {
    userId: attempt.userId,
    deviceClass: tokens.deviceToken.payload.dc,
    deviceToken: tokens.deviceToken,
    sessionToken: tokens.sessionToken,
  }
}
