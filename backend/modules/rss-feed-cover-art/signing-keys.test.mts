import { afterEach, describe, expect, it, vi } from 'vitest'
import { SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'
import { getSigningKeys } from './signing-keys.mts'

describe('getSigningKeys', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reads each test environment independently', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv(SIDELOAD_SIGNING_KEYS_ENV, 'first-key')
    expect(getSigningKeys()).toEqual(['first-key'])

    vi.stubEnv(SIDELOAD_SIGNING_KEYS_ENV, 'second-key')
    expect(getSigningKeys()).toEqual(['second-key'])
  })
})
