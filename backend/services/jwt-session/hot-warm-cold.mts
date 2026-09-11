import { isUUIDv7 } from '@ts-shared/session-jwt'
import { revokeSession } from './revocation.mts'
import { clearJwtStaleIfCurrent } from './invalidation.mts'
import { getEnrichedSessionClaims } from './enrich.mts'
import { createRefreshedAuthenticatedSession, issueAnonSession } from './refresh-token-rotation.mts'
import type {
  FetchUserForSession,
  RefreshedSessionState,
  SessionTokenPayload,
  VerifyDeviceAndSessionTokenResult,
} from './types.mts'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getJwtStaleKey } from '@data-stores/valkey/jwt-stale'
import {
  getJwtRevokedKey,
  getJwtUserRevokedBeforeKey,
  checkRevokedAndStaleScript,
} from './constants.mts'

export async function applyHotWarmCold(
  verified: VerifyDeviceAndSessionTokenResult,
  did: string,
  dt: string,
  sessionToken: string,
  fetchUser: FetchUserForSession,
  options?: { verifyRevocationOnHotPath?: boolean },
): Promise<RefreshedSessionState> {
  const uid = verified.uid!
  const now = Math.floor(Date.now() / 1000)
  const hasLegacyTokenId = !isUUIDv7(did) || !isUUIDv7(verified.sid)
  const membershipEntitlementExpired = verified.mpe !== undefined && now >= verified.mpe
  const canUseHotPath =
    !options?.verifyRevocationOnHotPath &&
    !hasLegacyTokenId &&
    !membershipEntitlementExpired &&
    verified.rca !== undefined &&
    now < verified.rca &&
    verified.sca !== undefined &&
    now < verified.sca

  // Hot path: sca not reached → return session as-is (0 Valkey calls). Callers that pass
  // verifyRevocationOnHotPath (e.g. direct backend callers of PATCH /api/v1/session and the
  // App Attest attest endpoint) always fall through to the warm check below instead.
  if (canUseHotPath) {
    return {
      did,
      dt,
      st: sessionToken,
      sid: verified.sid,
      uid,
      session: verified as SessionTokenPayload,
      deviceClass: verified.dc,
    }
  }

  // Warm path: check Valkey for revocation and staleness (single Lua roundtrip)
  const warmResult = await sessionValkeyClient.invokeScript(checkRevokedAndStaleScript, {
    keys: [getJwtRevokedKey(verified.sid), getJwtStaleKey(uid), getJwtUserRevokedBeforeKey(uid)],
    args: [verified.iat === undefined ? '0' : String(verified.iat)],
  })
  const [revokedRaw, staleRaw] = Array.isArray(warmResult) ? warmResult : [0, null]
  const revoked = Number(revokedRaw) !== 0
  const staleMarker =
    typeof staleRaw === 'string'
      ? staleRaw
      : Buffer.isBuffer(staleRaw)
        ? staleRaw.toString('utf8')
        : null
  const stale = staleMarker !== null

  if (revoked) {
    return issueAnonSession(did, dt, verified.dc)
  }

  // Warm path — not stale, rca not reached → re-issue with existing enrichment to refresh sca
  if (!stale && !membershipEntitlementExpired && verified.rca !== undefined && now < verified.rca) {
    const refreshed = await createRefreshedAuthenticatedSession({
      did,
      dt,
      sid: verified.sid,
      uid,
      roles: verified.rol,
      membershipPlan: verified.mpl,
      membershipExpiresAt: verified.mpe === undefined ? undefined : new Date(verified.mpe * 1000),
      trustTier: verified.tt,
      uiLocale: verified.uil,
      deviceClass: verified.dc,
      freshness: { type: 'preserve', recheckAfter: verified.rca },
    })
    return {
      did: refreshed.did,
      dt: refreshed.dt,
      st: refreshed.st,
      sid: refreshed.session.sid,
      uid,
      session: refreshed.session,
      deviceClass: refreshed.deviceClass,
    }
  }

  // Cold path: reload enriched claims from DB
  const user = await fetchUser(uid)
  const claims = user ? await getEnrichedSessionClaims(user) : null

  if (!claims || claims.suspended) {
    await revokeSession(verified.sid)
    return issueAnonSession(did, dt, verified.dc)
  }

  const refreshed = await createRefreshedAuthenticatedSession({
    did,
    dt,
    sid: verified.sid,
    uid,
    roles: claims.roles,
    membershipPlan: claims.membershipPlan,
    membershipExpiresAt: claims.membershipExpiresAt,
    trustTier: claims.trustTier,
    uiLocale: claims.uiLocale,
    deviceClass: verified.dc,
    freshness: { type: 'reset' },
  })
  if (staleMarker) await clearJwtStaleIfCurrent(uid, staleMarker)
  return {
    did: refreshed.did,
    dt: refreshed.dt,
    st: refreshed.st,
    sid: refreshed.session.sid,
    uid,
    session: refreshed.session,
    deviceClass: refreshed.deviceClass,
  }
}
