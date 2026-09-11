import { describe, expect, it } from 'vitest'
import { rateLimitConfig } from './config.mts'

describe('user rate-limit config', () => {
  it('leaves enablement to the route-rate-limit kill switch', () => {
    expect(rateLimitConfig.fieldTypes).not.toHaveProperty('enabled')
    expect(rateLimitConfig.defaultFields).not.toHaveProperty('enabled')
  })

  it('defaults the most restrictive sensitive tiers to a threshold of five', () => {
    expect(rateLimitConfig.defaultFields.sensitive_tier0).toBe(5)
    expect(rateLimitConfig.defaultFields.sensitive_tier1).toBe(5)
  })
})
