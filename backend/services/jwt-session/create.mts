import { markDbscRegistrationEligible } from './dbsc-eligibility.mts'
import { createSessionAssuranceBinding, assertOriginalMfaVerifiedAt } from './assurance.mts'
import { mintAuthenticatedDeviceAuthority } from './device-authority-mint.mts'
import { createSessionClientBinding } from './client-binding.mts'
import type {
  DeviceAndSessionTokenResult,
  SessionTokenResult,
  SessionMintOptions,
} from './types.mts'
import {
  signDeviceJwt,
  signSessionJwt,
  sessionExpirySecondsFor,
  DEVICE_EXPIRATION_STRING,
} from '@ts-shared/session-jwt'
import {
  mintUuidv7 as mintUUIDv7,
  validateUuidv7 as validateUUIDv7,
} from '@vouchington/session-jwt'
import { validate as isUUID } from 'uuid'
import {
  getSessionEnrichment,
  getSessionIssuedAt,
  recordSessionMintEvent,
  registerSessionMintMetadata,
} from './session-state-helpers.mts'
export async function createDeviceAndSessionTokens({
  did,
  sid = mintUUIDv7(),
  uid = null,
  roles,
  mfaVerifiedAt,
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
  credentialReplay,
  deviceRenewal,
  clock,
  query,
}: SessionMintOptions): Promise<DeviceAndSessionTokenResult> {
  validateUUIDv7(did)
  validateUUIDv7(sid)
  if (uid !== null) validateExistingUserId(uid)
  const now = await getSessionIssuedAt(uid, clock)
  let binding = uid
    ? createSessionAssuranceBinding(
        clientBinding ?? createSessionClientBinding(deviceClass, deviceContext),
        mfaVerifiedAt,
        now,
      )
    : undefined
  const authority =
    uid && binding
      ? await mintAuthenticatedDeviceAuthority({
          query,
          uid,
          did,
          sid,
          binding,
          deviceClass,
          deviceContext,
          authOrigin,
          issuedAt: now,
          credentialReplay,
          deviceRenewal,
        })
      : undefined
  if (authority) binding = authority.binding
  const sessionPayloadExtra = getSessionEnrichment({
    uid,
    roles,
    mfaVerifiedAt: binding?.mfa_at,
    membershipPlan,
    membershipExpiresAt,
    trustTier,
    uiLocale,
    recheckAfter,
    now,
  })
  const devicePayloadExtra = {
    ...(deviceClass !== undefined && { dc: deviceClass }),
    ...binding,
    ...(uid && { refresh_uid: uid, refresh_sid: sid }),
  }
  const [deviceToken, sessionToken] = await Promise.all([
    authority
      ? Promise.resolve(authority.token)
      : signDeviceJwt(
          { did, ...devicePayloadExtra },
          { expiresIn: DEVICE_EXPIRATION_STRING, issuedAt: now },
        ),
    signSessionJwt(
      { did, sid, uid: uid ?? null, ...binding, ...sessionPayloadExtra },
      { expiresIn: now + sessionExpirySecondsFor(deviceClass, binding?.client), issuedAt: now },
    ),
  ])
  recordSessionMintEvent({ did, sid, uid, eventType }, query)
  if (!authority)
    await registerSessionMintMetadata(
      { did, sid, uid, deviceClass, deviceContext, authOrigin, sessionExpiresAt, binding },
      query,
    )
  const result: DeviceAndSessionTokenResult = {
    deviceToken: {
      token: deviceToken,
      payload: authority?.payload ?? { did, ...devicePayloadExtra },
    },
    sessionToken: {
      token: sessionToken,
      payload: { did, sid, uid: uid ?? null, ...binding, ...sessionPayloadExtra },
    },
  }
  if (authority?.created && authority.binding.client === 'web')
    markDbscRegistrationEligible(result.deviceToken)
  return result
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
  clock,
  query,
}: Omit<
  SessionMintOptions,
  'credentialReplay' | 'deviceRenewal' | 'mfaVerifiedAt'
>): Promise<SessionTokenResult> {
  validateUUIDv7(did)
  validateUUIDv7(sid)
  if (uid !== null) validateExistingUserId(uid)

  const binding = uid
    ? (clientBinding ?? createSessionClientBinding(deviceClass, deviceContext))
    : undefined
  const now = await getSessionIssuedAt(uid, clock)
  assertOriginalMfaVerifiedAt(binding?.mfa_at, now)

  const sessionPayloadExtra = getSessionEnrichment({
    uid,
    roles,
    mfaVerifiedAt: binding?.mfa_at,
    membershipPlan,
    membershipExpiresAt,
    trustTier,
    uiLocale,
    recheckAfter,
    now,
  })

  const payload = { did, sid, uid: uid ?? null, ...binding, ...sessionPayloadExtra }

  const token = await signSessionJwt(payload, {
    expiresIn: now + sessionExpirySecondsFor(deviceClass, binding?.client),
    issuedAt: now,
  })
  recordSessionMintEvent({ did, sid, uid, eventType }, query)
  await registerSessionMintMetadata(
    { did, sid, uid, deviceClass, deviceContext, authOrigin, sessionExpiresAt, binding },
    query,
  )
  return { token, payload }
}

function validateExistingUserId(value: string): void {
  if (!isUUID(value)) validateUUIDv7(value)
}
