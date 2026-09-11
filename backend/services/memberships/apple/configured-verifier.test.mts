import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConfiguredAppleAppStoreId } from './configured-verifier.mts'

describe('configured Apple verifier', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('omits the numeric app ID in sandbox', () => {
    vi.stubEnv('APPLE_APP_STORE_APP_ID', undefined)
    expect(getConfiguredAppleAppStoreId('test')).toBeUndefined()
  })

  it.each([undefined, '', '0', '-1', 'not-a-number'])(
    'rejects an invalid production app ID: %s',
    rawAppId => {
      vi.stubEnv('APPLE_APP_STORE_APP_ID', rawAppId)
      expect(() => getConfiguredAppleAppStoreId('production')).toThrow(
        'APPLE_APP_STORE_APP_ID must be a positive integer in production',
      )
    },
  )

  it('returns the configured production app ID', () => {
    vi.stubEnv('APPLE_APP_STORE_APP_ID', '123456789')
    expect(getConfiguredAppleAppStoreId('production')).toBe(123456789)
  })
})
