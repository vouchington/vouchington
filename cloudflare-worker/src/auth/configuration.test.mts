import { describe, expect, it } from 'vitest'
import { configuredSessionKeys } from '../../test-helpers/session-keys.mts'
import { assertWorkerSessionJwtConfiguration } from './configuration.mts'

describe('Worker deployed key configuration', () => {
  it('rejects missing keys on staging even when PRODUCTION is false', async () => {
    await expect(
      assertWorkerSessionJwtConfiguration({ ENVIRONMENT: 'staging', PRODUCTION: 'false' }),
    ).rejects.toThrow('must be configured')
  })
  it('accepts the session verifier without edge-anon keys on staging', async () => {
    await expect(
      assertWorkerSessionJwtConfiguration({
        ENVIRONMENT: 'staging',
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64:
          configuredSessionKeys.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64,
      }),
    ).resolves.toBeUndefined()
  })
  it.each([
    ['private', configuredSessionKeys.VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64, undefined],
    ['public', undefined, configuredSessionKeys.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64],
  ])('rejects only the %s edge-anon key on staging', async (_kind, privateKeys, publicKeys) => {
    await expect(
      assertWorkerSessionJwtConfiguration({
        ENVIRONMENT: 'staging',
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64:
          configuredSessionKeys.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64,
        VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64: privateKeys,
        VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64: publicKeys,
      }),
    ).rejects.toThrow('edge anon session keys must be configured together')
  })
  it('accepts explicit configured key sets on staging', async () => {
    await expect(
      assertWorkerSessionJwtConfiguration({
        ...configuredSessionKeys,
        ENVIRONMENT: 'staging',
        PRODUCTION: 'false',
      }),
    ).resolves.toBeUndefined()
  })
  it('permits the development fallback for local requests', async () => {
    await expect(
      assertWorkerSessionJwtConfiguration({ ENVIRONMENT: 'development' }),
    ).resolves.toBeUndefined()
  })
})
