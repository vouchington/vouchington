import { describe, expect, it } from 'vitest'
import { canUseCache } from '../cache-route-policy.mts'

describe('canUseCache', () => {
  it('returns true for GET requests in cache mode', () => {
    expect(canUseCache(new Request('https://example.com/', { method: 'GET' }), 'cache')).toBe(true)
  })

  it('returns false for HEAD requests in cache mode (would share the GET entry)', () => {
    expect(canUseCache(new Request('https://example.com/', { method: 'HEAD' }), 'cache')).toBe(
      false,
    )
  })

  it('returns false for POST requests even in cache mode', () => {
    expect(
      canUseCache(new Request('https://example.com/', { method: 'POST', body: '{}' }), 'cache'),
    ).toBe(false)
  })

  it('returns false for GET requests in bypass mode', () => {
    expect(canUseCache(new Request('https://example.com/', { method: 'GET' }), 'bypass')).toBe(
      false,
    )
  })
})
