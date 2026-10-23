import { describe, expect, it } from 'vitest'
import { assertSessionJwtConfiguration } from './configuration.mts'
import { derivePublicJwk, encodeJwkSet as encodeJwkSetForEnv } from '@vouchington/session-jwt'
import testPrivateKey from './test-jwt-private-key.mts'

const emptyKeys = {
  VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: '',
  VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: '',
}

describe('session key configuration', () => {
  it.each(['staging', 'production'])(
    'refuses absent keys in %s even with an explicit development mode',
    async ENVIRONMENT => {
      await expect(
        assertSessionJwtConfiguration({
          env: { ...emptyKeys, ENVIRONMENT, NODE_ENV: 'test' },
          mode: 'development',
        }),
      ).rejects.toThrow('must be configured')
    },
  )

  it('allows the local fallback only outside deployed environments', async () => {
    await expect(
      assertSessionJwtConfiguration(
        { env: { ...emptyKeys, ENVIRONMENT: 'development', NODE_ENV: 'test' } },
        { signing: true },
      ),
    ).resolves.toBeUndefined()
  })

  it('cannot reuse a cached local fallback after deployment classification changes', async () => {
    const env = { ...emptyKeys, ENVIRONMENT: 'development' }
    await assertSessionJwtConfiguration({ env, mode: 'development' })
    env.ENVIRONMENT = 'staging'
    await expect(assertSessionJwtConfiguration({ env, mode: 'development' })).rejects.toThrow(
      'must be configured',
    )
  })

  it('validates a configured signing key at boot', async () => {
    await expect(
      assertSessionJwtConfiguration(
        {
          env: {
            ...emptyKeys,
            ENVIRONMENT: 'staging',
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([testPrivateKey]),
          },
        },
        { signing: true },
      ),
    ).resolves.toBeUndefined()
  })

  it('rejects verification-only keys when a signer is required', async () => {
    await expect(
      assertSessionJwtConfiguration(
        {
          env: {
            ...emptyKeys,
            ENVIRONMENT: 'staging',
            VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([
              derivePublicJwk(testPrivateKey),
            ]),
          },
        },
        { signing: true },
      ),
    ).rejects.toThrow('must contain a signing key')
  })

  it('rejects a public key supplied as a signing key before startup', async () => {
    await expect(
      assertSessionJwtConfiguration(
        {
          env: {
            ...emptyKeys,
            ENVIRONMENT: 'staging',
            VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: encodeJwkSetForEnv([
              derivePublicJwk(testPrivateKey),
            ]),
          },
        },
        { signing: true },
      ),
    ).rejects.toThrow(/private/)
  })

  it('rejects a configuration with no usable verification keys before startup', async () => {
    await expect(
      assertSessionJwtConfiguration({
        env: {
          ...emptyKeys,
          ENVIRONMENT: 'staging',
          VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: encodeJwkSetForEnv([
            { kty: 'RSA', kid: 'invalid-verification-key' },
          ]),
        },
      }),
    ).rejects.toThrow('must contain a verification key')
  })
})
