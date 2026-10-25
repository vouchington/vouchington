import { describe, expect, it } from 'vitest'
import { BLUESKY_JWT_PRIVATE_KEYS_ENV, getBlueskyKeyset } from './keyset.mts'
import testPrivateKey from './test-jwk-private-key.mts'

describe('getBlueskyKeyset', () => {
  it('falls back to the bundled test key outside production when unconfigured', async () => {
    const keyset = await getBlueskyKeyset({ mode: 'test', env: '' })
    expect(keyset.publicJwks.keys.map(key => key.kid)).toEqual([testPrivateKey.kid])
  })

  it('never offers the bundled test key in production', async () => {
    await expect(getBlueskyKeyset({ mode: 'production', env: '' })).rejects.toThrow(
      new RegExp(`${BLUESKY_JWT_PRIVATE_KEYS_ENV} must be configured in production`),
    )
  })
})
