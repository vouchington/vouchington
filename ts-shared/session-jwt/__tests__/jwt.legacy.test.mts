import { describe, expect, it } from 'vitest'
import * as jose from 'jose'
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid'
import { encodeJwkSetForEnv, signSessionJwt, verifyDeviceJwt, verifySessionJwt } from '../jwt.mts'
import { DEVICE_TOKEN_AUDIENCE, SESSION_JWT_ISSUER, SESSION_TOKEN_AUDIENCE } from '../types.mts'

async function generatePrivateJwk(kid: string): Promise<jose.JWK> {
  const { privateKey } = await jose.generateKeyPair('RS512', { extractable: true })
  const jwk = await jose.exportJWK(privateKey)
  return { ...jwk, alg: 'RS512', kid, use: 'sig' }
}

async function signRawJwt({
  key,
  payload,
  audience,
}: {
  key: jose.JWK
  payload: jose.JWTPayload
  audience: string
}): Promise<string> {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'RS512', kid: key.kid })
    .setIssuedAt()
    .setIssuer(SESSION_JWT_ISSUER)
    .setAudience(audience)
    .setExpirationTime('1h')
    .sign((await jose.importJWK(key, 'RS512')) as jose.CryptoKey)
}

describe('legacy UUID session JWT verification', () => {
  it('accepts signed device tokens with a UUIDv4 device id', async () => {
    const key = await generatePrivateJwk('legacy-device-key')
    const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
    const did = uuidv4()

    const token = await signRawJwt({ key, payload: { did }, audience: DEVICE_TOKEN_AUDIENCE })

    await expect(verifyDeviceJwt(token, { env, mode: 'test' })).resolves.toMatchObject({ did })
  })

  it('accepts signed session tokens with legacy UUIDv4 ids', async () => {
    const key = await generatePrivateJwk('legacy-session-key')
    const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
    const payload = { did: uuidv4(), sid: uuidv4(), uid: uuidv4() }

    const token = await signRawJwt({ key, payload, audience: SESSION_TOKEN_AUDIENCE })

    await expect(verifySessionJwt(token, { env, mode: 'test' })).resolves.toMatchObject(payload)
  })

  it('signs session tokens for existing non-v7 user ids', async () => {
    const key = await generatePrivateJwk('legacy-user-key')
    const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
    const payload = { did: uuidv7(), sid: uuidv7(), uid: uuidv4() }

    const token = await signSessionJwt(payload, { env, mode: 'test', expiresIn: '1h' })

    await expect(verifySessionJwt(token, { env, mode: 'test' })).resolves.toMatchObject(payload)
  })
})
