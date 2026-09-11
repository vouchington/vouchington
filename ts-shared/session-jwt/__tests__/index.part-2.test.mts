import { afterEach, expect, it, vi, describe } from 'vitest'
import * as jose from 'jose'
import { v7 as uuidv7 } from 'uuid'
import { derivePublicJwk, encodeJwkSetForEnv, signSessionJwt, verifySessionJwt } from '../index.mts'

describe('index', () => {
  const makeIds = () => ({ did: uuidv7(), sid: uuidv7(), uid: uuidv7() })

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

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('uses web base64 globals when Buffer is unavailable', async () => {
    const privateKey = await generatePrivateJwk('worker-runtime-key')
    const nodeBuffer = Buffer
    const encodedKeySet = nodeBuffer.from(JSON.stringify([privateKey]), 'utf-8').toString('base64')

    vi.stubGlobal('Buffer', undefined)
    vi.stubGlobal('btoa', (value: string) => nodeBuffer.from(value, 'utf-8').toString('base64'))
    vi.stubGlobal('atob', (value: string) => nodeBuffer.from(value, 'base64').toString('utf-8'))

    expect(encodeJwkSetForEnv([privateKey])).toBe(encodedKeySet)
    const { did, sid, uid } = makeIds()

    const token = await signSessionJwt(
      { did, sid, uid },
      {
        env: {
          VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodedKeySet,
        },
        mode: 'production',
        expiresIn: '2 days',
      },
    )

    const payload = await verifySessionJwt(token, {
      env: {
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([derivePublicJwk(privateKey)]),
      },
      mode: 'production',
    })

    expect(payload?.sid).toBe(sid)
  })

  it('throws error when base64 decoding is unavailable', async () => {
    vi.stubGlobal('Buffer', undefined)
    vi.stubGlobal('atob', undefined)
    const { did, sid, uid } = makeIds()

    await expect(
      signSessionJwt(
        { did, sid, uid },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: 'abc',
          },
          mode: 'production',
          expiresIn: '2 days',
        },
      ),
    ).rejects.toThrow('base64 decoding is unavailable in this runtime')
  })

  describe('getDefaultMode branches', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    })

    it('falls back to development mode when process is unavailable', async () => {
      vi.stubGlobal('process', undefined)
      const { did, sid, uid } = makeIds()
      const tokenPromise = signSessionJwt(
        { did, sid, uid },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: '',
            VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '',
          },
          expiresIn: '2 days',
        },
      )
      vi.unstubAllGlobals()

      const token = await tokenPromise
      expect(token).toBeDefined()
    })

    it('throws in production mode when keys are missing', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      const { did, sid, uid } = makeIds()
      await expect(
        signSessionJwt(
          { did, sid, uid },
          {
            env: {
              VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: '',
              VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '',
            },
            expiresIn: '2 days',
          },
        ),
      ).rejects.toThrow('must be configured in production')
    })

    it('falls back to development mode in test environment', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      const { did, sid, uid } = makeIds()
      const token = await signSessionJwt(
        { did, sid, uid },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: '',
            VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '',
          },
          expiresIn: '2 days',
        },
      )
      expect(token).toBeDefined()
    })

    it('falls back to development mode for other environments', async () => {
      vi.stubEnv('NODE_ENV', 'other')
      const { did, sid, uid } = makeIds()
      const token = await signSessionJwt(
        { did, sid, uid },
        {
          env: {
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: '',
            VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '',
          },
          expiresIn: '2 days',
        },
      )
      expect(token).toBeDefined()
    })
  })
})
