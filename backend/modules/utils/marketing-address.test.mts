import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getMarketingPostalAddress,
  MARKETING_POSTAL_ADDRESS_PLACEHOLDER,
} from './marketing-address.mts'

describe('getMarketingPostalAddress', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses the explicit configured mailing address', () => {
    vi.stubEnv('MARKETING_POSTAL_ADDRESS', '123 Example Street, Portland, OR 97205')

    expect(getMarketingPostalAddress()).toBe('123 Example Street, Portland, OR 97205')
  })

  it('uses the deployment placeholder until an address is configured', () => {
    vi.stubEnv('MARKETING_POSTAL_ADDRESS', undefined)

    expect(getMarketingPostalAddress()).toBe(MARKETING_POSTAL_ADDRESS_PLACEHOLDER)
  })
})
