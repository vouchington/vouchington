import { describe, expect, it } from 'vitest'
import { configuredSessionKeys } from '../../test-helpers/session-keys.mts'
import { assertWorkerSessionJwtConfiguration } from './configuration.mts'

describe('Worker deployed key configuration', () => {
  it('rejects missing keys on staging even when PRODUCTION is false', async () => {
    await expect(
      assertWorkerSessionJwtConfiguration({ ENVIRONMENT: 'staging', PRODUCTION: 'false' }),
    ).rejects.toThrow('must be configured')
  })
  it('requires anonymous signing keys before dispatch in deployed environments', async () => {
    await expect(
      assertWorkerSessionJwtConfiguration({
        ENVIRONMENT: 'staging',
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64:
          configuredSessionKeys.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64,
      }),
    ).rejects.toThrow('anonymous session keys')
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
