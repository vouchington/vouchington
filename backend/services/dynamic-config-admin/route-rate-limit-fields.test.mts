import { describe, expect, it } from 'vitest'
import { routeRateLimitFields } from './route-rate-limit-fields.mts'

describe('route rate-limit dynamic config fields', () => {
  it('describes the kill switch as applying to all route rate limiting', () => {
    expect(routeRateLimitFields().enabled.description).toBe('Enable route rate limiting.')
  })

  it.each(['anon_read', 'anon_write', 'anon_sensitive', 'anon_oauth_callback'] as const)(
    'requires positive integer thresholds for %s',
    field => {
      expect(routeRateLimitFields()[field]).toMatchObject({
        minValue: 1,
        integer: true,
      })
    },
  )

  it.each([
    'anon_read_ttl',
    'anon_write_ttl',
    'anon_sensitive_ttl',
    'anon_oauth_callback_ttl',
  ] as const)('requires positive integer TTLs for %s', field => {
    expect(routeRateLimitFields()[field]).toMatchObject({
      minValue: 1,
      integer: true,
    })
  })
})
