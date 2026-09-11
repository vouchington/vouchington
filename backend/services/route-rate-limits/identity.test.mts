import { describe, it, expect } from 'vitest'
import { buildRateLimitKeys, resolveRateLimitIdentities } from './identity.mts'
import { getRouteConfig } from './config.mts'
import type { RateLimitIdentities } from './types.mts'

describe('buildRateLimitKeys', () => {
  it('includes IP key when IP is present', () => {
    const identities: RateLimitIdentities = { ip: '192.0.2.1' }
    const keys = buildRateLimitKeys('GET:/api/v1/posts', identities)
    expect(keys).toContain('ip:192.0.2.1:GET:/api/v1/posts')
  })

  it('includes all browser session dimensions when present', () => {
    const identities: RateLimitIdentities = {
      ip: '192.0.2.1',
      deviceId: 'device-123',
      sessionId: 'session-456',
      userId: 'user-789',
    }
    const keys = buildRateLimitKeys('POST:/api/v1/posts', identities)
    expect(keys).toContain('ip:192.0.2.1:POST:/api/v1/posts')
    expect(keys).toContain('did:device-123:POST:/api/v1/posts')
    expect(keys).toContain('sid:session-456:POST:/api/v1/posts')
    expect(keys).toContain('uid:user-789:POST:/api/v1/posts')
    expect(keys).toHaveLength(4)
  })

  it('API key path: only IP + apikey keys, no device/session/user', () => {
    const identities: RateLimitIdentities = {
      ip: '192.0.2.1',
      apiKeyId: 'abcd1234',
    }
    const keys = buildRateLimitKeys('POST:/api/v1/posts', identities)
    expect(keys).toContain('ip:192.0.2.1:POST:/api/v1/posts')
    expect(keys).toContain('apikey:abcd1234:POST:/api/v1/posts')
    expect(keys).toHaveLength(2)
    // No device/session/user keys
    expect(keys.some(k => k.startsWith('did:'))).toBe(false)
    expect(keys.some(k => k.startsWith('sid:'))).toBe(false)
    expect(keys.some(k => k.startsWith('uid:'))).toBe(false)
  })

  it('omits optional dimensions when not provided', () => {
    const identities: RateLimitIdentities = {
      ip: '192.0.2.1',
      deviceId: 'device-123',
      // No sessionId or userId
    }
    const keys = buildRateLimitKeys('GET:/api/v1/posts', identities)
    expect(keys).toContain('ip:192.0.2.1:GET:/api/v1/posts')
    expect(keys).toContain('did:device-123:GET:/api/v1/posts')
    expect(keys).toHaveLength(2)
    expect(keys.some(k => k.startsWith('sid:'))).toBe(false)
    expect(keys.some(k => k.startsWith('uid:'))).toBe(false)
  })

  it('returns empty array when no identities', () => {
    const identities: RateLimitIdentities = {}
    const keys = buildRateLimitKeys('GET:/api/v1/posts', identities)
    expect(keys).toHaveLength(0)
  })

  it('sanitizes route key for Valkey key safety', () => {
    const identities: RateLimitIdentities = { ip: '10.0.0.1' }
    // Route key with param placeholders — no braces in our route keys
    const keys = buildRateLimitKeys('GET:/api/v1/posts/:id', identities)
    // Should not contain { or } in the key
    expect(keys[0]).not.toMatch(/[{}]/)
  })

  it('uses route-specific prefix to isolate counters per route', () => {
    const identities: RateLimitIdentities = { ip: '192.0.2.1', userId: 'user-1' }
    const keys1 = buildRateLimitKeys('GET:/api/v1/posts', identities)
    const keys2 = buildRateLimitKeys('POST:/api/v1/posts', identities)
    // Keys should differ by route prefix
    expect(keys1).not.toEqual(keys2)
    expect(keys1[0]).toContain('GET:/api/v1/posts')
    expect(keys2[0]).toContain('POST:/api/v1/posts')
  })
})

describe('resolveRateLimitIdentities', () => {
  it('does not treat a raw bearer token as a validated API key', async () => {
    const identities = await resolveRateLimitIdentities({
      ip: '192.0.2.1',
      getSessionTokenData: () =>
        Promise.resolve({
          did: 'device-123',
          sid: 'session-456',
          uid: 'user-789',
          tt: 3,
        }),
    })

    expect(identities).toEqual({
      ip: '192.0.2.1',
      deviceId: 'device-123',
      sessionId: 'session-456',
      userId: 'user-789',
      userTrustTier: 3,
    })
  })

  it('uses API-key identity only after a caller passes a validated API key id', async () => {
    const identities = await resolveRateLimitIdentities({
      ip: '192.0.2.1',
      validatedApiKeyId: 'key-123',
      getSessionTokenData: () =>
        Promise.reject(new Error('session data should not be loaded for validated API keys')),
    })

    expect(identities).toEqual({ ip: '192.0.2.1', apiKeyId: 'key-123' })
  })

  it('ignores out-of-range signed trust tiers', async () => {
    const identities = await resolveRateLimitIdentities({
      ip: '192.0.2.1',
      getSessionTokenData: () =>
        Promise.resolve({
          did: 'device-123',
          sid: 'session-456',
          uid: 'user-789',
          tt: 999,
        }),
    })

    expect(identities.userTrustTier).toBeUndefined()
  })
})

describe('auth route registry', () => {
  it('classifies MFA verification routes as sensitive', () => {
    expect(getRouteConfig('POST:/api/v1/auth/mfa/totp/verification').category).toBe('sensitive')
    expect(
      getRouteConfig('POST:/api/v1/auth/mfa/passkeys/authentication/verification').category,
    ).toBe('sensitive')
  })
})
