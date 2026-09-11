import { verifyDeviceJwt, verifySessionJwt, signDeviceJwt, signSessionJwt } from './jwt.mts'
import { DEVICE_EXPIRATION_STRING, sessionExpiryFor } from './constants.mts'
import type { DeviceClass, JwtRuntimeOptions, SessionTokenPayload } from './types.mts'
import { isUUIDv7, mintUUIDv7 } from './uuidv7.mts'

export type EnsureAnonResult = {
  did: string
  sid: string
  dt: string
  st: string
  session: SessionTokenPayload
  mintedDt: boolean
  mintedSt: boolean
  dc?: DeviceClass
}

export async function ensureAnonymousSession(
  options: {
    deviceToken?: string | null
    sessionToken?: string | null
  } & JwtRuntimeOptions,
): Promise<EnsureAnonResult> {
  const { deviceToken, sessionToken, ...jwtOptions } = options

  // Resolve did: reuse from valid device token or generate fresh
  const devicePayload = deviceToken ? await verifyDeviceJwt(deviceToken, jwtOptions) : null
  let did: string
  let dt: string
  let mintedDt: boolean

  if (devicePayload && isUUIDv7(devicePayload.did)) {
    did = devicePayload.did
    dt = deviceToken!
    mintedDt = false
  } else {
    did = mintUUIDv7()
    dt = await signDeviceJwt({ did }, { ...jwtOptions, expiresIn: DEVICE_EXPIRATION_STRING })
    mintedDt = true
  }

  // Resolve st: reuse valid anon session for same did, or mint fresh
  const sessionPayload = sessionToken ? await verifySessionJwt(sessionToken, jwtOptions) : null
  let st: string
  let session: SessionTokenPayload
  let mintedSt: boolean

  if (sessionPayload && sessionPayload.did === did && sessionPayload.uid === null) {
    st = sessionToken!
    session = sessionPayload
    mintedSt = false
  } else {
    const sid = mintUUIDv7()
    session = { did, sid, uid: null }
    st = await signSessionJwt(session, {
      ...jwtOptions,
      expiresIn: sessionExpiryFor(mintedDt ? undefined : devicePayload?.dc),
    })
    mintedSt = true
  }

  return {
    did,
    sid: session.sid,
    dt,
    st,
    session,
    mintedDt,
    mintedSt,
    dc: mintedDt ? undefined : devicePayload?.dc,
  }
}
