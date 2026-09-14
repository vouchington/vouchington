import * as jose from 'jose'
import { validate as uuidValidate, v4 as legacyUuidV4, version as uuidVersion } from 'uuid'
import {
  DEVICE_TOKEN_AUDIENCE,
  SESSION_JWT_ISSUER,
  SESSION_TOKEN_AUDIENCE,
} from '../../../../ts-shared/session-jwt/index.mts'
import testPrivateKey from '../../../../ts-shared/session-jwt/test-jwt-private-key.mts'

export { legacyUuidV4 }

async function signLegacyJwt(
  payload: jose.JWTPayload,
  audience: typeof DEVICE_TOKEN_AUDIENCE | typeof SESSION_TOKEN_AUDIENCE,
  expiresIn: '30 days' | '2 days',
): Promise<string> {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'RS512', kid: testPrivateKey.kid })
    .setIssuedAt()
    .setIssuer(SESSION_JWT_ISSUER)
    .setAudience(audience)
    .setExpirationTime(expiresIn)
    .sign((await jose.importJWK(testPrivateKey, 'RS512')) as jose.CryptoKey)
}

export function expectUuidV7(value: string): void {
  if (!uuidValidate(value) || uuidVersion(value) !== 7) {
    throw new Error(`Expected UUIDv7, received ${value}`)
  }
}

export async function signLegacyDeviceJwt(payload: jose.JWTPayload): Promise<string> {
  return signLegacyJwt(payload, DEVICE_TOKEN_AUDIENCE, '30 days')
}

export async function signLegacySessionJwt(payload: jose.JWTPayload): Promise<string> {
  return signLegacyJwt(payload, SESSION_TOKEN_AUDIENCE, '2 days')
}
