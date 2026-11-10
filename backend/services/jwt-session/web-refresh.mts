import { verifyDeviceAndSessionTokens } from './verify.mts'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import { assertSessionClientBinding } from './client-binding.mts'
import { isSessionRevoked, revokeSession } from './revocation.mts'
import { getEnrichedSessionClaims } from './enrich.mts'
import { createRefreshedAuthenticatedSession, issueAnonSession } from './refresh-token-rotation.mts'
import type { DbscAuthorization, FetchUserForSession, RefreshedSessionState } from './types.mts'

/** A web dt authorizes refresh only. Access tokens remain subject to their short expiry. */
export async function refreshWebSessionFromDeviceToken(
  dt: string,
  userAgent: string | undefined,
  fetchUser: FetchUserForSession,
  ja4?: string,
  dbscProof?: DbscAuthorization,
): Promise<RefreshedSessionState | null> {
  const device = await verifyDeviceJwt(dt)
  if (
    !device ||
    device.client !== 'web' ||
    typeof device.exp !== 'number' ||
    typeof device.iat !== 'number' ||
    !device.ua_hash ||
    !device.refresh_uid ||
    !device.refresh_sid
  )
    return null
  assertSessionClientBinding(device, userAgent, ja4)
  if (
    await isSessionRevoked(device.refresh_sid, {
      userId: device.refresh_uid,
      issuedAt: device.iat,
      mfaVerifiedAt: device.mfa_at ?? null,
    })
  ) {
    return issueAnonSession(device.did, dt, device.dc)
  }
  const user = await fetchUser(device.refresh_uid)
  const claims = user
    ? await getEnrichedSessionClaims(user, { mfaVerifiedAt: device.mfa_at })
    : null
  if (!claims) return issueAnonSession(device.did, dt, device.dc)
  const refreshed = await createRefreshedAuthenticatedSession({
    did: device.did,
    dt,
    dbscProof,
    sid: device.refresh_sid,
    uid: device.refresh_uid,
    ...claims,
    deviceClass: device.dc,
    deviceExpiresAt: device.exp,
    clientBinding: {
      client: 'web',
      ua_hash: device.ua_hash,
      ja4_hash: device.ja4_hash,
      ...(device.mfa_at !== undefined && { mfa_at: device.mfa_at }),
    },
    freshness: { type: 'reset' },
  })
  return {
    ...refreshed,
    uid: device.refresh_uid,
    sid: device.refresh_sid,
  }
}

/** A signed device credential may revoke its own authority after access-token expiry. */
export async function getSessionForLogout(options: {
  deviceToken?: string
  sessionToken?: string
}): Promise<{ uid: string; sid: string; iat?: number } | null> {
  if (!options.deviceToken) return null
  const paired = options.sessionToken
    ? await verifyDeviceAndSessionTokens({
        deviceToken: options.deviceToken,
        sessionToken: options.sessionToken,
      })
    : false
  if (paired && paired.uid) {
    return {
      uid: paired.uid,
      sid: paired.sid,
      iat: paired.device_iat,
    }
  }
  const device = await verifyDeviceJwt(options.deviceToken)
  if (
    !device ||
    (device.client !== 'web' && device.client !== 'native') ||
    (device.client === 'native' && device.dc !== 'attested') ||
    typeof device.exp !== 'number' ||
    typeof device.iat !== 'number' ||
    (device.client === 'web' && !device.ua_hash) ||
    !device.refresh_uid ||
    !device.refresh_sid
  )
    return null
  return { uid: device.refresh_uid, sid: device.refresh_sid, iat: device.iat }
}

/** Logout revocation is permitted by a signed device principal, independent of UA or access expiry. */
export async function revokeSessionForLogout(options: {
  deviceToken?: string
  sessionToken?: string
}): Promise<void> {
  const principal = await getSessionForLogout(options)
  if (principal) await revokeSession(principal.sid)
}
