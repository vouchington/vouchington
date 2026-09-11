import { describe, expect, it, vi, afterEach } from 'vitest'
import * as jose from 'jose'
import { v7 as uuidv7 } from 'uuid'
import {
  encodeJwkSetForEnv,
  decodeSessionJwt,
  signDeviceJwt,
  signSessionJwt,
  verifyDeviceJwt,
  verifySessionJwt,
} from '../jwt.mts'
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

describe('jwt.mts', () => {
  const makeIds = () => ({ did: uuidv7(), sid: uuidv7(), uid: uuidv7() })

  describe('encodeJwkSetForEnv', () => {
    const mockJwk: jose.JWK = { kty: 'RSA', e: 'AQAB', n: 'mock-n' }
    const jsonString = JSON.stringify([mockJwk])
    const expectedBase64 = Buffer.from(jsonString).toString('base64')

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('uses Buffer if available', () => {
      const toString = vi.fn<(encoding: string) => string>().mockReturnValue('buffer-encoded')
      const from = vi
        .fn<(value: string, encoding: string) => { toString: typeof toString }>()
        .mockReturnValue({ toString })
      const btoa = vi.fn<(value: string) => string>().mockReturnValue('btoa-encoded')
      vi.stubGlobal('Buffer', { from })
      vi.stubGlobal('btoa', btoa)

      const result = encodeJwkSetForEnv([mockJwk])

      expect(from).toHaveBeenCalledWith(jsonString, 'utf-8')
      expect(toString).toHaveBeenCalledWith('base64')
      expect(btoa).not.toHaveBeenCalled()
      expect(result).toBe('buffer-encoded')
    })

    it('uses btoa if Buffer is not available', () => {
      const nodeBuffer = Buffer
      const btoa = vi.fn<(value: string) => string>(value =>
        nodeBuffer.from(value, 'utf-8').toString('base64'),
      )
      vi.stubGlobal('Buffer', undefined)
      vi.stubGlobal('btoa', btoa)

      const result = encodeJwkSetForEnv([mockJwk])

      expect(btoa).toHaveBeenCalledWith(jsonString)
      expect(result).toBe(expectedBase64)
    })

    it('throws error if neither Buffer nor btoa is available', () => {
      vi.stubGlobal('Buffer', undefined)
      vi.stubGlobal('btoa', undefined)

      expect(() => encodeJwkSetForEnv([mockJwk])).toThrow(
        'base64 encoding is unavailable in this runtime',
      )
    })
  })

  describe('decodeSessionJwt', () => {
    it('returns decoded payload for valid token', async () => {
      const { did, sid } = makeIds()
      const payload = { did, sid, uid: null }
      const token = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode('secret'))

      const decoded = decodeSessionJwt(token)
      expect(decoded).toMatchObject(payload)
    })

    it('returns null for a token with a malformed session payload', async () => {
      const token = await new jose.SignJWT({ uid: 'user-1' })
        .setProtectedHeader({ alg: 'HS256' })
        .sign(new TextEncoder().encode('secret'))

      const decoded = decodeSessionJwt(token)
      expect(decoded).toBeNull()
    })

    it('returns null for invalid token', () => {
      const decoded = decodeSessionJwt('invalid-token')
      expect(decoded).toBeNull()
    })
  })

  describe('signDeviceJwt and verifyDeviceJwt', () => {
    it('signs and verifies device token successfully', async () => {
      const key = await generatePrivateJwk('device-key-1')
      const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
      const payload = { did: uuidv7() }

      const token = await signDeviceJwt(payload, { env, mode: 'test', expiresIn: '1h' })
      expect(typeof token).toBe('string')

      const verified = await verifyDeviceJwt(token, { env, mode: 'test' })
      expect(verified?.did).toBe(payload.did)
      expect(verified?.iss).toBe(SESSION_JWT_ISSUER)
      expect(verified?.aud).toBe('voucha:device')
    })

    it('throws error if no signing key is configured', async () => {
      const payload = { did: uuidv7() }
      const key = await generatePrivateJwk('device-key-1')
      const publicJwk = { ...key }
      delete publicJwk.d
      delete publicJwk.dp
      delete publicJwk.dq
      delete publicJwk.p
      delete publicJwk.q
      delete publicJwk.qi
      const env = { VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([publicJwk]) }
      // Test the path where keyset is valid but has no private keys (e.g. env has only public keys)
      await expect(signDeviceJwt(payload, { env, mode: 'test', expiresIn: '1h' })).rejects.toThrow(
        'VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64 must be configured for signing',
      )
    })

    it('returns null if token has invalid header', async () => {
      const verified = await verifyDeviceJwt('invalid-token', { mode: 'test' })
      expect(verified).toBeNull()
    })

    it('returns null if token has invalid signature', async () => {
      const key1 = await generatePrivateJwk('key-1')
      const key2 = await generatePrivateJwk('key-2')
      const mismatchedKeyWithMatchingKid = { ...key2, kid: key1.kid }
      const env1 = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key1]) }
      const env2 = {
        VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([mismatchedKeyWithMatchingKid]),
      }
      const payload = { did: uuidv7() }

      const token = await signDeviceJwt(payload, { env: env1, mode: 'test', expiresIn: '1h' })
      const verified = await verifyDeviceJwt(token, { env: env2, mode: 'test' })
      expect(verified).toBeNull()
    })

    it('returns null if no matching key is found', async () => {
      const signingKey = await generatePrivateJwk('key-1')
      const nonMatchingKey = await generatePrivateJwk('key-2')
      const signingEnv = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([signingKey]) }
      const verificationEnv = {
        VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([nonMatchingKey]),
      }
      const payload = { did: uuidv7() }

      const token = await signDeviceJwt(payload, {
        env: signingEnv,
        mode: 'test',
        expiresIn: '1h',
      })
      const verified = await verifyDeviceJwt(token, { env: verificationEnv, mode: 'test' })
      expect(verified).toBeNull()
    })

    it('returns null when a signed device token omits did', async () => {
      const key = await generatePrivateJwk('device-key-missing-did')
      const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }

      const token = await signRawJwt({
        key,
        payload: {},
        audience: DEVICE_TOKEN_AUDIENCE,
      })

      const verified = await verifyDeviceJwt(token, { env, mode: 'test' })
      expect(verified).toBeNull()
    })

    it('signs and verifies a device token carrying a known dc claim', async () => {
      const key = await generatePrivateJwk('device-key-dc')
      const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
      const payload = { did: uuidv7(), dc: 'attested' as const }

      const token = await signDeviceJwt(payload, { env, mode: 'test', expiresIn: '1h' })
      const verified = await verifyDeviceJwt(token, { env, mode: 'test' })
      expect(verified?.did).toBe(payload.did)
      expect(verified?.dc).toBe('attested')
    })

    it('returns null when a signed device token carries an unknown dc value', async () => {
      const key = await generatePrivateJwk('device-key-unknown-dc')
      const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }

      const token = await signRawJwt({
        key,
        payload: { did: uuidv7(), dc: 'not-a-real-device-class' },
        audience: DEVICE_TOKEN_AUDIENCE,
      })

      const verified = await verifyDeviceJwt(token, { env, mode: 'test' })
      expect(verified).toBeNull()
    })
  })

  describe('signSessionJwt and verifySessionJwt', () => {
    it('signs and verifies session token successfully', async () => {
      const key = await generatePrivateJwk('session-key-1')
      const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }
      const payload = { did: uuidv7(), sid: uuidv7(), uid: uuidv7() }

      const token = await signSessionJwt(payload, { env, mode: 'test', expiresIn: '1h' })
      expect(typeof token).toBe('string')

      const verified = await verifySessionJwt(token, { env, mode: 'test' })
      expect(verified?.did).toBe(payload.did)
      expect(verified?.sid).toBe(payload.sid)
      expect(verified?.uid).toBe(payload.uid)
      expect(verified?.iss).toBe(SESSION_JWT_ISSUER)
      expect(verified?.aud).toBe('voucha:session')
    })

    it('throws error if no signing key is configured', async () => {
      const payload = { did: uuidv7(), sid: uuidv7(), uid: uuidv7() }
      const key = await generatePrivateJwk('session-key-1')
      const publicJwk = { ...key }
      delete publicJwk.d
      delete publicJwk.dp
      delete publicJwk.dq
      delete publicJwk.p
      delete publicJwk.q
      delete publicJwk.qi
      const env = { VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([publicJwk]) }
      await expect(signSessionJwt(payload, { env, mode: 'test', expiresIn: '1h' })).rejects.toThrow(
        'VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64 must be configured for signing',
      )
    })

    it('returns null if token has invalid header', async () => {
      const verified = await verifySessionJwt('invalid-token', { mode: 'test' })
      expect(verified).toBeNull()
    })

    it.each([
      ['missing did', { sid: uuidv7(), uid: uuidv7() }],
      ['missing sid', { did: uuidv7(), uid: uuidv7() }],
      ['missing uid', { did: uuidv7(), sid: uuidv7() }],
      ['empty uid', { did: uuidv7(), sid: uuidv7(), uid: '' }],
      ['invalid roles', { did: uuidv7(), sid: uuidv7(), uid: uuidv7(), rol: [1] }],
      ['invalid max profile level', { did: uuidv7(), sid: uuidv7(), uid: uuidv7(), mpl: 1 }],
      ['invalid trust tier', { did: uuidv7(), sid: uuidv7(), uid: uuidv7(), tt: '1' }],
      ['invalid recheck timestamp', { did: uuidv7(), sid: uuidv7(), uid: uuidv7(), rca: '1' }],
      [
        'invalid session check timestamp',
        { did: uuidv7(), sid: uuidv7(), uid: uuidv7(), sca: '1' },
      ],
    ])('returns null when a signed session token has %s', async (_name, payload) => {
      const key = await generatePrivateJwk('session-key-malformed-payload')
      const env = { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key]) }

      const token = await signRawJwt({
        key,
        payload,
        audience: SESSION_TOKEN_AUDIENCE,
      })

      const verified = await verifySessionJwt(token, { env, mode: 'test' })
      expect(verified).toBeNull()
    })
  })
})
