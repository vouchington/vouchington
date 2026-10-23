import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import * as jose from 'jose'
import { v7 as uuidv7 } from 'uuid'
import { SESSION_JWT_ISSUER, signSessionJwt, verifySessionJwt } from '../index.mts'
import { encodeJwkSet as encodeJwkSetForEnv, derivePublicJwk } from '@vouchington/session-jwt'

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

const fixedNow = process.env.VOUCH_PROOF_NOW
  ? Date.parse(process.env.VOUCH_PROOF_NOW)
  : Date.UTC(2026, 0, 31, 23, 59, 59)

if (
  !Number.isFinite(fixedNow) ||
  (process.env.VOUCH_PROOF_NOW !== undefined && !process.env.VOUCH_PROOF_NOW.endsWith('Z'))
) {
  throw new Error('VOUCH_PROOF_NOW must be a finite UTC timestamp ending in Z')
}

describe('@ts-shared/session-jwt', () => {
  beforeEach(() => {
    onTestFinished(() => {
      vi.useRealTimers()
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(fixedNow)
  })
  afterEach(() => vi.useRealTimers())
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

  it('rejects an empty configured production verification key set', async () => {
    const { did, sid } = makeIds()
    const privateKey = await generatePrivateJwk('empty-public-policy')
    const token = await signSessionJwt(
      { did, sid, uid: null },
      {
        mode: 'production',
        env: { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([privateKey]) },
        expiresIn: '2 days',
      },
    )
    await expect(
      verifySessionJwt(token, {
        mode: 'production',
        env: { VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([]) },
      }),
    ).rejects.toThrow('VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64 must contain at least one JWK')
  })

  it('rejects ambiguous public key identities across rotation candidates', async () => {
    const signingKey = await generatePrivateJwk('ambiguous-public-kid')
    const otherKey = await generatePrivateJwk('ambiguous-public-kid')
    const { did, sid } = makeIds()
    const token = await signSessionJwt(
      { did, sid, uid: null },
      {
        mode: 'production',
        env: { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([signingKey]) },
        expiresIn: '2 days',
      },
    )
    await expect(
      verifySessionJwt(token, {
        mode: 'production',
        env: {
          VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([
            derivePublicJwk(signingKey),
            derivePublicJwk(otherKey),
          ]),
        },
      }),
    ).rejects.toThrow('contains duplicate kid values: ambiguous-public-kid')
  })

  it('preserves Unicode rotation key identities from public environment bindings', async () => {
    const signingKey = await generatePrivateJwk('clé-🔑')
    const { did, sid } = makeIds()
    const token = await signSessionJwt(
      { did, sid, uid: null },
      {
        mode: 'production',
        env: { VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([signingKey]) },
        expiresIn: '2 days',
      },
    )
    await expect(
      verifySessionJwt(token, {
        mode: 'production',
        env: {
          VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([derivePublicJwk(signingKey)]),
        },
      }),
    ).resolves.toMatchObject({ did, sid, uid: null })
  })
})
