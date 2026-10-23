import { verifyDeviceJwt, type DeviceClass } from '@ts-shared/session-jwt'
import { mintUuidv7 as mintUUIDv7 } from '@vouchington/session-jwt'

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
