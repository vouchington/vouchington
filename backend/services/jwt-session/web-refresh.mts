import { verifyDeviceAndSessionTokens } from './verify.mts'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import { assertSessionUserAgent } from './client-binding.mts'
import { isSessionRevoked } from './revocation.mts'
import { getEnrichedSessionClaims } from './enrich.mts'
import { createRefreshedAuthenticatedSession, issueAnonSession } from './refresh-token-rotation.mts'
import type { FetchUserForSession, RefreshedSessionState } from './types.mts'

/** A web dt authorizes refresh only. Access tokens remain subject to their short expiry. */
export async function refreshWebSessionFromDeviceToken(
  dt: string,
  userAgent: string | undefined,
  fetchUser: FetchUserForSession,
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
  assertSessionUserAgent(device, userAgent)
  if (
    await isSessionRevoked(device.refresh_sid, { userId: device.refresh_uid, issuedAt: device.iat })
  ) {
    return issueAnonSession(device.did, dt, device.dc)
  }
  const user = await fetchUser(device.refresh_uid)
  const claims = user ? await getEnrichedSessionClaims(user) : null
  if (!claims) return issueAnonSession(device.did, dt, device.dc)
  const refreshed = await createRefreshedAuthenticatedSession({
    did: device.did,
    dt,
    sid: device.refresh_sid,
    uid: device.refresh_uid,
    ...claims,
    deviceClass: device.dc,
    deviceExpiresAt: device.exp,
    clientBinding: { client: 'web', ua_hash: device.ua_hash },
    freshness: { type: 'reset' },
  })
  return {
    ...refreshed,
    uid: device.refresh_uid,
    sid: device.refresh_sid,
  }
}

/** Logout may revoke web refresh authority even after its access cookie expires. */
export async function getSessionForLogout(options: {
  deviceToken?: string
  sessionToken?: string
  userAgent?: string
}): Promise<{ uid: string; sid: string; iat?: number } | null> {
  if (!options.deviceToken) return null
  const paired = options.sessionToken
    ? await verifyDeviceAndSessionTokens({
        deviceToken: options.deviceToken,
        sessionToken: options.sessionToken,
      })
    : false
  if (paired && paired.uid) {
    assertSessionUserAgent(paired, options.userAgent)
    return {
      uid: paired.uid,
      sid: paired.sid,
      iat: paired.client === 'web' ? paired.device_iat : paired.iat,
    }
  }
  const device = await verifyDeviceJwt(options.deviceToken)
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
  assertSessionUserAgent(device, options.userAgent)
  return { uid: device.refresh_uid, sid: device.refresh_sid, iat: device.iat }
}
