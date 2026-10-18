import { describe, expect, it } from 'vitest'
import { normalizeFields } from '@vouchington/dynamic-config'
import { validateDynamicConfigUpdate } from 'valkyries/dynamic-config'
import { dynamicConfigRegistry } from './registry.mts'
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

  it('rejects unsafe integer values before they are stored', () => {
    const entry = dynamicConfigRegistry.get('route-rate-limit-config')
    if (!entry) throw new Error('route-rate-limit-config registry entry missing')
    const previous = normalizeFields(entry, entry.config.defaultFields)

    expect(() => validateDynamicConfigUpdate(entry, previous, { anon_read: 2 ** 53 })).toThrow(
      'Field anon_read must be a safe integer',
    )
    expect(() => validateDynamicConfigUpdate(entry, previous, { anon_read_ttl: 2 ** 53 })).toThrow(
      'Field anon_read_ttl must be a safe integer',
    )
  })
})
