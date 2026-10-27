import { afterEach, describe, expect, it, vi } from 'vitest'
import { SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'

describe('getSigningKeys', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('caches the configured signing key set for the process lifetime', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv(SIDELOAD_SIGNING_KEYS_ENV, 'current-key,previous-key')
    vi.resetModules()

    const { getSigningKeys } = await import('./signing-keys.mts')
    expect(getSigningKeys()).toEqual(['current-key', 'previous-key'])

    vi.stubEnv(SIDELOAD_SIGNING_KEYS_ENV, 'rotated-key,current-key')
    expect(getSigningKeys()).toEqual(['current-key', 'previous-key'])
  })
})
