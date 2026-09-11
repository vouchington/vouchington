import { isUUIDv7 } from '@ts-shared/session-jwt'
import { createDeviceAndSessionTokens, createSessionToken } from './create.mts'
import type { DeviceClass, RefreshedSessionState, SessionTokenPayload } from './types.mts'

type RefreshFreshness = { type: 'preserve'; recheckAfter: number } | { type: 'reset' }

export async function issueAnonSession(
  did: string,
  dt: string,
  deviceClass?: DeviceClass,
): Promise<RefreshedSessionState> {
  if (!isUUIDv7(did)) {
    const tokens = await createDeviceAndSessionTokens({
      did,
      eventType: 'refreshed_anonymous',
      deviceClass,
    })
    return {
      did: tokens.deviceToken.payload.did,
      dt: tokens.deviceToken.token,
      st: tokens.sessionToken.token,
      sid: tokens.sessionToken.payload.sid,
      uid: null,
      session: tokens.sessionToken.payload,
      deviceClass: tokens.deviceToken.payload.dc,
    }
  }

  const token = await createSessionToken({ did, eventType: 'refreshed_anonymous', deviceClass })
  return {
    did,
    dt,
    st: token.token,
    sid: token.payload.sid,
    uid: null,
    session: token.payload,
    deviceClass,
  }
}

export async function createRefreshedAuthenticatedSession(options: {
  did: string
  dt: string
  sid: string
  uid: string
  roles?: readonly string[]
  membershipPlan?: string | null
  membershipExpiresAt?: Date | null
  trustTier?: number
  uiLocale?: string | null
  deviceClass?: DeviceClass
  freshness: RefreshFreshness
}): Promise<{
  did: string
  dt: string
  st: string
  session: SessionTokenPayload
  deviceClass?: DeviceClass
}> {
  if (!isUUIDv7(options.did)) {
    const tokens = await createDeviceAndSessionTokens({
      did: options.did,
      sid: options.sid,
      uid: options.uid,
      roles: options.roles,
      membershipPlan: options.membershipPlan,
      membershipExpiresAt: options.membershipExpiresAt,
      trustTier: options.trustTier,
      uiLocale: options.uiLocale,
      eventType: 'refreshed_authenticated',
      deviceClass: options.deviceClass,
      ...(options.freshness.type === 'preserve' && {
        recheckAfter: options.freshness.recheckAfter,
      }),
    })
    return {
      did: tokens.deviceToken.payload.did,
      dt: tokens.deviceToken.token,
      st: tokens.sessionToken.token,
      session: tokens.sessionToken.payload,
      deviceClass: tokens.deviceToken.payload.dc,
    }
  }

  const token = await createSessionToken({
    did: options.did,
    sid: options.sid,
    uid: options.uid,
    roles: options.roles,
    membershipPlan: options.membershipPlan,
    membershipExpiresAt: options.membershipExpiresAt,
    trustTier: options.trustTier,
    uiLocale: options.uiLocale,
    eventType: 'refreshed_authenticated',
    deviceClass: options.deviceClass,
    ...(options.freshness.type === 'preserve' && {
      recheckAfter: options.freshness.recheckAfter,
    }),
  })
  return {
    did: options.did,
    dt: options.dt,
    st: token.token,
    session: token.payload,
    deviceClass: options.deviceClass,
  }
}
