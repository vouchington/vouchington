import { describe, expect, it } from 'vitest'
import * as jose from 'jose'
import { v7 as uuidv7 } from 'uuid'
import { encodeJwkSetForEnv, verifyDeviceJwt, verifySessionJwt } from '../jwt.mts'
import { derivePublicJwk } from '../keys.mts'

describe('JWT compatibility', () => {
  const emptyProductionEnv = {
    mode: 'production' as const,
    env: { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: '', VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '' },
  }

  it.each([
    ['device', () => verifyDeviceJwt('invalid-token', emptyProductionEnv)],
    ['session', () => verifySessionJwt('invalid-token', emptyProductionEnv)],
  ])(
    'returns null for malformed %s tokens before reading key configuration',
    async (_name, verify) => {
      await expect(verify()).resolves.toBeNull()
    },
  )

  it.each([
    [
      'device',
      () => verifyDeviceJwt('eyJhbGciOiJSUzUxMiJ9.eyJkaWQiOiJ4In0.signature', emptyProductionEnv),
    ],
    [
      'session',
      () => verifySessionJwt('eyJhbGciOiJSUzUxMiJ9.eyJkaWQiOiJ4In0.signature', emptyProductionEnv),
    ],
  ])('keeps well-formed %s token configuration failures observable', async (_name, verify) => {
    await expect(verify()).rejects.toThrow('must be configured in production')
  })

  it.each(['device', 'session'] as const)('verifies a legacy empty-kid %s token', async kind => {
    const { privateKey } = await jose.generateKeyPair('RS512', { extractable: true })
    const key = {
      ...(await jose.exportJWK(privateKey)),
      alg: 'RS512',
      kid: 'configured',
      use: 'sig',
    }
    const payload =
      kind === 'device' ? { did: uuidv7() } : { did: uuidv7(), sid: uuidv7(), uid: null }
    const token = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'RS512', kid: '' })
      .setIssuedAt()
      .setIssuer('voucha.ai')
      .setAudience(kind === 'device' ? 'voucha:device' : 'voucha:session')
      .setExpirationTime('1h')
      .sign(privateKey)
    const options = {
      mode: 'production' as const,
      env: {
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([
          { kty: 'RSA', alg: 'RS512', kid: 'broken-key', use: 'sig' },
          derivePublicJwk(key),
        ]),
      },
    }
    const verified =
      kind === 'device'
        ? await verifyDeviceJwt(token, options)
        : await verifySessionJwt(token, options)
    expect(verified?.did).toBe(payload.did)
  })

  it('returns null when a candidate public key cannot be imported', async () => {
    const { privateKey } = await jose.generateKeyPair('RS512')
    const token = await new jose.SignJWT({ did: uuidv7() })
      .setProtectedHeader({ alg: 'RS512', kid: 'broken-key' })
      .setIssuer('voucha.ai')
      .setAudience('voucha:device')
      .setExpirationTime('1h')
      .sign(privateKey)
    const options = {
      mode: 'production' as const,
      env: {
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([
          { kty: 'RSA', alg: 'RS512', kid: 'broken-key', use: 'sig' },
        ]),
      },
    }

    await expect(verifyDeviceJwt(token, options)).resolves.toBeNull()
  })
})
