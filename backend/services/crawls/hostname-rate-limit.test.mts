import { expect, it, describe } from 'vitest'
import { insertTestUrlHostname } from '@voucha/test-helpers'
import { computeRateLimitForHostname } from './hostname-rate-limit.mts'

describe('hostname-rate-limit', () => {
  it('computeRateLimitForHostname returns undefined for missing hostname ID', async () => {
    const result = await computeRateLimitForHostname('00000000-0000-0000-0000-000000000000')
    expect(result).toBeUndefined()
  })

  it('computeRateLimitForHostname returns the default delay for a valid hostname', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const hostnameId = await insertTestUrlHostname({
      hostname: `ratelimit-${random}.example.com`,
      crawlable: false,
    })

    const result = await computeRateLimitForHostname(hostnameId)
    expect(result).toBe(1000)
  })
})
