import { rotateAuthenticatedDeviceToken } from './device-authority-rotation.mts'
import { verifyDeviceJwt, signDeviceJwt, DEVICE_EXPIRATION_STRING } from '@ts-shared/session-jwt'
import type {
  SessionClientBinding,
  DeviceClass,
  RefreshedSessionState,
  SessionTokenPayload,
} from './types.mts'
import { createSessionToken } from './create.mts'

type RefreshFreshness = { type: 'preserve'; recheckAfter: number } | { type: 'reset' }

export async function issueAnonSession(
  did: string,
  dt: string,
  deviceClass?: DeviceClass,
): Promise<RefreshedSessionState> {
  const device = await verifyDeviceJwt(dt)
  const anonymousDt = device?.refresh_uid
    ? await signDeviceJwt(
        { did, ...(deviceClass && { dc: deviceClass }) },
        { expiresIn: DEVICE_EXPIRATION_STRING },
      )
    : dt
  const token = await createSessionToken({ did, eventType: 'refreshed_anonymous', deviceClass })
  return {
    did,
    dt: anonymousDt,
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
  clock?: () => number
  clientBinding: SessionClientBinding
  deviceExpiresAt?: number
}): Promise<{
  did: string
  dt: string
  st: string
  session: SessionTokenPayload
  deviceClass?: DeviceClass
}> {
  const dt = await rotateAuthenticatedDeviceToken({
    deviceToken: options.dt,
    uid: options.uid,
    did: options.did,
    sid: options.sid,
  })
  const token = await createSessionToken({
    did: options.did,
    sid: options.sid,
    clock: options.clock,
    uid: options.uid,
    roles: options.roles,
    membershipPlan: options.membershipPlan,
    membershipExpiresAt: options.membershipExpiresAt,
    trustTier: options.trustTier,
    uiLocale: options.uiLocale,
    eventType: 'refreshed_authenticated',
    deviceClass: options.deviceClass,
    clientBinding: options.clientBinding,
    sessionExpiresAt:
      options.clientBinding.client === 'web' && options.deviceExpiresAt !== undefined
        ? new Date(options.deviceExpiresAt * 1000)
        : undefined,
    ...(options.freshness.type === 'preserve' && {
      recheckAfter: options.freshness.recheckAfter,
    }),
  })
  return {
    did: options.did,
    dt,
    st: token.token,
    session: token.payload,
    deviceClass: options.deviceClass,
  }
}
