import {
  isUUIDv7,
  signDeviceJwt,
  signSessionJwt,
  sessionExpiryFor,
  DEVICE_EXPIRATION_STRING,
  RECHECK_AFTER_SECONDS,
  SESSION_CHECK_AFTER_SECONDS,
  mintUUIDv7,
  validateUUIDv7,
} from '@ts-shared/session-jwt'
import { validate as isUUID } from 'uuid'
import type { DeviceAndSessionTokenResult, DeviceClass, DeviceContext } from './types.mts'
import { trackAuthSessionEvent } from '@services/analytics'
import type { AuthSessionRecord } from '@data-stores/analytics'
import { registerAuthenticatedSession } from './user-sessions.mts'
import { getUserSessionsRevokedBefore } from './session-revocation-keys.mts'
import { revokeSession } from './revocation.mts'

export async function createDeviceAndSessionTokens({
  did,
  sid = mintUUIDv7(),
  uid = null,
  roles,
  membershipPlan,
  membershipExpiresAt,
  trustTier,
  uiLocale,
  eventType = 'created',
  deviceClass,
  deviceContext,
  recheckAfter,
}: {
  did: string
  sid?: string
  uid?: string | null
  roles?: readonly string[]
  membershipPlan?: string | null
  membershipExpiresAt?: Date | null
  trustTier?: number
  uiLocale?: string | null
  eventType?: AuthSessionRecord['event_type']
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  recheckAfter?: number
}): Promise<DeviceAndSessionTokenResult> {
  const tokenDid = normalizeRefreshableTokenId(did)
  const tokenSid = normalizeRefreshableTokenId(sid)
  const tokenDeviceClass = tokenDid === did ? deviceClass : undefined
  if (uid !== null) validateExistingUserId(uid)
  const now = await getSessionIssuedAt(uid)
  const sessionPayloadExtra =
    uid !== null
      ? {
          ...(roles !== undefined && { rol: roles }),
          ...(membershipPlan !== undefined && { mpl: membershipPlan }),
          ...getMembershipExpiryClaim(membershipExpiresAt),
          ...(trustTier !== undefined && { tt: trustTier }),
          ...(uiLocale !== undefined && uiLocale !== null && { uil: uiLocale }),
          rca: recheckAfter ?? now + RECHECK_AFTER_SECONDS,
          sca: now + SESSION_CHECK_AFTER_SECONDS,
        }
      : {}

  const devicePayloadExtra = tokenDeviceClass !== undefined ? { dc: tokenDeviceClass } : {}

  const [deviceToken, sessionToken] = await Promise.all([
    signDeviceJwt(
      { did: tokenDid, ...devicePayloadExtra },
      { expiresIn: DEVICE_EXPIRATION_STRING },
    ),
    signSessionJwt(
      { did: tokenDid, sid: tokenSid, uid: uid ?? null, ...sessionPayloadExtra },
      { expiresIn: sessionExpiryFor(tokenDeviceClass), issuedAt: now },
    ),
  ])

  trackAuthSessionEvent({ did: tokenDid, sid: tokenSid, uid, eventType })
  await registerAuthenticatedSession({
    did: tokenDid,
    sid: tokenSid,
    uid,
    deviceClass: tokenDeviceClass,
    deviceContext,
  })
  if (uid !== null && tokenSid !== sid) await revokeSession(sid)

  return {
    deviceToken: {
      token: deviceToken,
      payload: { did: tokenDid, ...devicePayloadExtra },
    },
    sessionToken: {
      token: sessionToken,
      payload: { did: tokenDid, sid: tokenSid, uid: uid ?? null, ...sessionPayloadExtra },
    },
  }
}

export async function createSessionToken({
  did,
  sid = mintUUIDv7(),
  uid = null,
  roles,
  membershipPlan,
  membershipExpiresAt,
  trustTier,
  uiLocale,
  eventType = 'created',
  deviceClass,
  deviceContext,
  recheckAfter,
}: {
  did: string
  sid?: string
  uid?: string | null
  roles?: readonly string[]
  membershipPlan?: string | null
  membershipExpiresAt?: Date | null
  trustTier?: number
  uiLocale?: string | null
  eventType?: AuthSessionRecord['event_type']
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  recheckAfter?: number
}): Promise<{
  token: string
  payload: {
    did: string
    sid: string
    uid: string | null
    rol?: readonly string[]
    mpl?: string | null
    mpe?: number
    tt?: number
    uil?: string | null
    rca?: number
    sca?: number
  }
}> {
  validateUUIDv7(did)
  const tokenSid = normalizeRefreshableTokenId(sid)
  if (uid !== null) validateExistingUserId(uid)

  const now = await getSessionIssuedAt(uid)

  const sessionPayloadExtra =
    uid !== null
      ? {
          ...(roles !== undefined && { rol: roles }),
          ...(membershipPlan !== undefined && { mpl: membershipPlan }),
          ...getMembershipExpiryClaim(membershipExpiresAt),
          ...(trustTier !== undefined && { tt: trustTier }),
          ...(uiLocale !== undefined && uiLocale !== null && { uil: uiLocale }),
          rca: recheckAfter ?? now + RECHECK_AFTER_SECONDS,
          sca: now + SESSION_CHECK_AFTER_SECONDS,
        }
      : {}

  const payload = { did, sid: tokenSid, uid: uid ?? null, ...sessionPayloadExtra }

  const token = await signSessionJwt(payload, {
    expiresIn: sessionExpiryFor(deviceClass),
    issuedAt: now,
  })
  trackAuthSessionEvent({ did, sid: tokenSid, uid, eventType })
  await registerAuthenticatedSession({
    did,
    sid: tokenSid,
    uid,
    deviceClass,
    deviceContext,
  })
  if (uid !== null && tokenSid !== sid) await revokeSession(sid)

  return { token, payload }
}

function normalizeRefreshableTokenId(value: string): string {
  if (isUUIDv7(value)) return value
  if (isUUID(value)) return mintUUIDv7()
  return validateUUIDv7(value)
}

function validateExistingUserId(value: string): void {
  if (!isUUID(value)) validateUUIDv7(value)
}

function getMembershipExpiryClaim(membershipExpiresAt?: Date | null): { mpe?: number } {
  return membershipExpiresAt ? { mpe: Math.floor(membershipExpiresAt.getTime() / 1000) } : {}
}

async function getSessionIssuedAt(uid: string | null): Promise<number> {
  const now = Math.floor(Date.now() / 1000)
  if (uid === null) return now
  const revokedBeforeSeconds = await getUserSessionsRevokedBefore(uid)
  return revokedBeforeSeconds !== null && revokedBeforeSeconds >= now
    ? revokedBeforeSeconds + 1
    : now
}
