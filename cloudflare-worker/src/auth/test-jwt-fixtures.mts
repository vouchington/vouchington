import {
  derivePublicJwk,
  encodeJwkSetForEnv,
  signDeviceJwt,
  signSessionJwt,
  DEVICE_EXPIRATION_STRING,
  SESSION_EXPIRATION_STRING,
  type DeviceTokenPayload,
  type SessionTokenPayload,
} from '@ts-shared/session-jwt'
import testPrivateKey from '@ts-shared/session-jwt/test-jwt-private-key'

export const TEST_SESSION_JWT_PUBLIC_KEYS_B64 = encodeJwkSetForEnv([
  derivePublicJwk(testPrivateKey),
])

export const createSignedDeviceJwt = (payload: Pick<DeviceTokenPayload, 'did'>) =>
  signDeviceJwt({ did: payload.did }, { expiresIn: DEVICE_EXPIRATION_STRING, mode: 'test' })

export const createSignedSessionJwt = (payload: Pick<SessionTokenPayload, 'did' | 'sid' | 'uid'>) =>
  signSessionJwt(
    {
      did: payload.did,
      sid: payload.sid,
      uid: payload.uid,
    },
    { expiresIn: SESSION_EXPIRATION_STRING, mode: 'test' },
  )
