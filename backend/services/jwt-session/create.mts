import { createSessionClientBinding, type SessionClientBinding } from './client-binding.mts'
import {
  signDeviceJwt,
  signSessionJwt,
  sessionExpiryFor,
  DEVICE_EXPIRATION_STRING,
  DEVICE_EXPIRATION_SECONDS,
  RECHECK_AFTER_SECONDS,
  SESSION_CHECK_AFTER_SECONDS,
} from '@ts-shared/session-jwt'
import {
  mintUuidv7 as mintUUIDv7,
  validateUuidv7 as validateUUIDv7,
} from '@vouchington/session-jwt'
import { validate as isUUID } from 'uuid'
import type {
  DeviceAndSessionTokenResult,
  DeviceClass,
  DeviceContext,
  SessionTokenResult,
} from './types.mts'
import { trackAuthSessionEvent } from '@services/analytics'
import type { AuthSessionRecord } from '@data-stores/analytics'
import { registerAuthenticatedSession } from './user-sessions.mts'
import { getMembershipExpiryClaim, getSessionIssuedAt } from './session-state-helpers.mts'

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
  authOrigin,
  clientBinding,
  sessionExpiresAt,
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
  authOrigin?: 'web' | 'native'
  clientBinding?: SessionClientBinding
  sessionExpiresAt?: Date
}): Promise<DeviceAndSessionTokenResult> {
  validateUUIDv7(did)
  validateUUIDv7(sid)
  if (uid !== null) validateExistingUserId(uid)
  const binding = uid
    ? (clientBinding ?? createSessionClientBinding(deviceClass, deviceContext))
    : undefined
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

  const devicePayloadExtra = {
    ...(deviceClass !== undefined && { dc: deviceClass }),
    ...binding,
    ...(binding?.client === 'web' && uid && { refresh_uid: uid, refresh_sid: sid }),
  }

  const [deviceToken, sessionToken] = await Promise.all([
    signDeviceJwt(
      { did, ...devicePayloadExtra },
      { expiresIn: DEVICE_EXPIRATION_STRING, issuedAt: now },
    ),
    signSessionJwt(
      { did, sid, uid: uid ?? null, ...binding, ...sessionPayloadExtra },
      { expiresIn: sessionExpiryFor(deviceClass, binding?.client), issuedAt: now },
    ),
  ])

  trackAuthSessionEvent({ did, sid, uid, eventType })
  await registerAuthenticatedSession({
    did,
    sid,
    uid,
    deviceClass,
    deviceContext,
    authOrigin,
    expiresAt:
      sessionExpiresAt ??
      (binding?.client === 'web'
        ? new Date(Date.now() + DEVICE_EXPIRATION_SECONDS * 1000)
        : undefined),
  })

  return {
    deviceToken: {
      token: deviceToken,
      payload: { did, ...devicePayloadExtra },
    },
    sessionToken: {
      token: sessionToken,
      payload: { did, sid, uid: uid ?? null, ...binding, ...sessionPayloadExtra },
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
  authOrigin,
  clientBinding,
  sessionExpiresAt,
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
  authOrigin?: 'web' | 'native'
  clientBinding?: SessionClientBinding
  sessionExpiresAt?: Date
}): Promise<SessionTokenResult> {
  validateUUIDv7(did)
  validateUUIDv7(sid)
  if (uid !== null) validateExistingUserId(uid)

  const binding = uid
    ? (clientBinding ?? createSessionClientBinding(deviceClass, deviceContext))
    : undefined
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

  const payload = { did, sid, uid: uid ?? null, ...binding, ...sessionPayloadExtra }

  const token = await signSessionJwt(payload, {
    expiresIn: sessionExpiryFor(deviceClass, binding?.client),
    issuedAt: now,
  })
  trackAuthSessionEvent({ did, sid, uid, eventType })
  await registerAuthenticatedSession({
    did,
    sid,
    uid,
    deviceClass,
    deviceContext,
    authOrigin,
    expiresAt:
      sessionExpiresAt ??
      (binding?.client === 'web'
        ? new Date(Date.now() + DEVICE_EXPIRATION_SECONDS * 1000)
        : undefined),
  })

  return { token, payload }
}

function validateExistingUserId(value: string): void {
  if (!isUUID(value)) validateUUIDv7(value)
}
