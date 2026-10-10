import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
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

const fixedNow = process.env.VOUCH_PROOF_NOW
  ? Date.parse(process.env.VOUCH_PROOF_NOW)
  : Date.UTC(2026, 0, 31, 23, 59, 59)

if (
  !Number.isFinite(fixedNow) ||
  (process.env.VOUCH_PROOF_NOW !== undefined && !process.env.VOUCH_PROOF_NOW.endsWith('Z'))
) {
  throw new Error('VOUCH_PROOF_NOW must be a finite UTC timestamp ending in Z')
}

describe('legacy UUID session JWT verification', () => {
  beforeEach(() => {
    onTestFinished(() => {
      vi.useRealTimers()
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(fixedNow)
  })
  afterEach(() => vi.useRealTimers())
  it('rejects signed device tokens with a UUIDv4 device id', async () => {
    const key = await generatePrivateJwk('legacy-device-key')
    const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
    const did = uuidv4()

    const token = await signRawJwt({ key, payload: { did }, audience: DEVICE_TOKEN_AUDIENCE })

    await expect(verifyDeviceJwt(token, { env, mode: 'test' })).resolves.toBeNull()
  })

  it('rejects signed session tokens with UUIDv4 device and session ids', async () => {
    const key = await generatePrivateJwk('legacy-session-key')
    const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
    const payload = { did: uuidv4(), sid: uuidv4(), uid: uuidv4() }

    const token = await signRawJwt({ key, payload, audience: SESSION_TOKEN_AUDIENCE })

    await expect(verifySessionJwt(token, { env, mode: 'test' })).resolves.toBeNull()
  })

  it('signs session tokens for existing non-v7 user ids', async () => {
    const key = await generatePrivateJwk('legacy-user-key')
    const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
    const payload = { did: uuidv7(), sid: uuidv7(), uid: uuidv4() }

    const token = await signSessionJwt(payload, { env, mode: 'test', expiresIn: '1h' })

    await expect(verifySessionJwt(token, { env, mode: 'test' })).resolves.toMatchObject(payload)
  })
})
