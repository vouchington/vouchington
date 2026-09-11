import { describe, expect, it } from 'vitest'
import * as jose from 'jose'
import { v7 as uuidv7 } from 'uuid'
import {
  SESSION_JWT_ISSUER,
  encodeJwkSetForEnv,
  derivePublicJwk,
  signSessionJwt,
  verifySessionJwt,
} from '../index.mts'

async function generatePrivateJwk(kid: string): Promise<jose.JWK> {
  const { privateKey } = await jose.generateKeyPair('RS512', { extractable: true })
  const jwk = await jose.exportJWK(privateKey)
  return {
    ...jwk,
    alg: 'RS512',
    kid,
    use: 'sig',
  }
}

describe('@ts-shared/session-jwt', () => {
  const makeIds = () => ({ did: uuidv7(), sid: uuidv7(), uid: uuidv7() })

  it('signs with the newest private key first', async () => {
    const newestKey = await generatePrivateJwk('newest-key')
    const olderKey = await generatePrivateJwk('older-key')
    const env = {
      VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([newestKey, olderKey]),
    }
    const { did, sid, uid } = makeIds()

    const token = await signSessionJwt(
      { did, sid, uid },
      { env, mode: 'production', expiresIn: '2 days' },
    )

    expect(jose.decodeProtectedHeader(token).kid).toBe('newest-key')
  })

  it('verifies tokens signed by an older rotated key', async () => {
    const newestKey = await generatePrivateJwk('newest-key')
    const olderKey = await generatePrivateJwk('older-key')
    const { did, sid, uid } = makeIds()
    const olderToken = await signSessionJwt(
      { did, sid, uid },
      {
        env: {
          VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([olderKey]),
        },
        mode: 'production',
        expiresIn: '2 days',
      },
    )

    const payload = await verifySessionJwt(olderToken, {
      env: {
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([
          derivePublicJwk(newestKey),
          derivePublicJwk(olderKey),
        ]),
      },
      mode: 'production',
    })

    expect(payload?.did).toBe(did)
    expect(payload?.sid).toBe(sid)
    expect(payload?.uid).toBe(uid)
  })

  it('verifies with derived public keys when only private keys are configured', async () => {
    const privateKey = await generatePrivateJwk('derived-public-key')
    const env = {
      VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([privateKey]),
    }
    const { did, sid } = makeIds()

    const token = await signSessionJwt(
      { did, sid, uid: null },
      { env, mode: 'production', expiresIn: '2 days' },
    )
    const payload = await verifySessionJwt(token, { env, mode: 'production' })

    expect(payload?.iss).toBe(SESSION_JWT_ISSUER)
    expect(payload?.uid).toBeNull()
  })

  it('rejects configured keys with the wrong algorithm', async () => {
    const privateKey = await generatePrivateJwk('wrong-alg')
    const { did, sid } = makeIds()

    await expect(
      signSessionJwt(
        { did, sid, uid: null },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([
              { ...privateKey, alg: 'RS256' },
            ]),
          },
          mode: 'production',
          expiresIn: '2 days',
        },
      ),
    ).rejects.toThrow('must use RS512')
  })

  it('rejects configured keys with the wrong key type', async () => {
    const { did, sid } = makeIds()
    await expect(
      signSessionJwt(
        { did, sid, uid: null },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([
              { kty: 'oct', alg: 'RS512', kid: 'wrong-kty', k: 'abc' },
            ]),
          },
          mode: 'production',
          expiresIn: '2 days',
        },
      ),
    ).rejects.toThrow('must be an RSA JWK')
  })

  it('rejects configured keys with the wrong key use', async () => {
    const privateKey = await generatePrivateJwk('wrong-use')
    const { did, sid } = makeIds()

    await expect(
      signSessionJwt(
        { did, sid, uid: null },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([
              { ...privateKey, use: 'enc' },
            ]),
          },
          mode: 'production',
          expiresIn: '2 days',
        },
      ),
    ).rejects.toThrow('must be a signature key')
  })

  it('rejects duplicate configured key ids', async () => {
    const key1 = await generatePrivateJwk('duplicate-kid')
    const key2 = await generatePrivateJwk('duplicate-kid')
    const { did, sid } = makeIds()

    await expect(
      signSessionJwt(
        { did, sid, uid: null },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([key1, key2]),
          },
          mode: 'production',
          expiresIn: '2 days',
        },
      ),
    ).rejects.toThrow('contains duplicate kid values')
  })

  it('throws in production mode if no keys are configured', async () => {
    const { did, sid } = makeIds()
    await expect(
      signSessionJwt(
        { did, sid, uid: null },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: '',
            VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '',
          },
          mode: 'production',
          expiresIn: '2 days',
        },
      ),
    ).rejects.toThrow(
      'VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64 or VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64 must be configured in production',
    )
  })

  it('rejects configured keys with missing kid', async () => {
    const privateKey = await generatePrivateJwk('missing-kid')
    const { kid: _, ...keyWithoutKid } = privateKey
    const { did, sid } = makeIds()

    await expect(
      signSessionJwt(
        { did, sid, uid: null },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([keyWithoutKid]),
          },
          mode: 'production',
          expiresIn: '2 days',
        },
      ),
    ).rejects.toThrow('is missing kid')
  })

  it('rejects configured keys when array contains a non-object', async () => {
    const { did, sid } = makeIds()
    await expect(
      signSessionJwt(
        { did, sid, uid: null },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: Buffer.from('[123]', 'utf-8').toString('base64'),
          },
          mode: 'production',
          expiresIn: '2 days',
        },
      ),
    ).rejects.toThrow('must be a JSON object')
  })

  it('rejects configured keys when array is empty', async () => {
    const { did, sid } = makeIds()
    await expect(
      signSessionJwt(
        { did, sid, uid: null },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: Buffer.from('[]', 'utf-8').toString('base64'),
          },
          mode: 'production',
          expiresIn: '2 days',
        },
      ),
    ).rejects.toThrow('must contain at least one JWK')
  })
})
