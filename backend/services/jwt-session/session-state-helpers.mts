import { verifyDeviceJwt, type DeviceClass } from '@ts-shared/session-jwt'
import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'
import { getUserSessionsRevokedBefore } from './session-revocation-keys.mts'

type DeviceState = {
  did: string
  token?: string
  valid: boolean
  dc?: DeviceClass
}

export async function resolveDeviceState(deviceToken?: string): Promise<DeviceState> {
  if (!deviceToken) return { did: mintUUIDv7(), valid: false }

  const payload = await verifyDeviceJwt(deviceToken)
  if (!payload) return { did: mintUUIDv7(), valid: false }

  return { did: payload.did, token: deviceToken, valid: true, dc: payload.dc }
}

export function getMembershipExpiryClaim(membershipExpiresAt?: Date | null): { mpe?: number } {
  return membershipExpiresAt ? { mpe: Math.floor(membershipExpiresAt.getTime() / 1000) } : {}
}

export async function getSessionIssuedAt(uid: string | null): Promise<number> {
  const now = Math.floor(Date.now() / 1000)
  if (uid === null) return now
  const revokedBeforeSeconds = await getUserSessionsRevokedBefore(uid)
  return revokedBeforeSeconds !== null && revokedBeforeSeconds >= now
    ? revokedBeforeSeconds + 1
    : now
}
