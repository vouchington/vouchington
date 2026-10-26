import { describe, it, expect } from 'vitest'
import { getRateLimitKeyDimensions, resolveRateLimitIdentities } from './identity.mts'
import { getRouteConfig } from './config.mts'
import type { RateLimitIdentities } from './types.mts'

describe('getRateLimitKeyDimensions', () => {
  it('selects IP when IP is present', () => {
    const identities: RateLimitIdentities = { ip: '192.0.2.1' }
    expect(getRateLimitKeyDimensions(identities)).toEqual({
      ip: '192.0.2.1',
      did: undefined,
      sid: undefined,
      uid: undefined,
      email: undefined,
    })
  })

  it('includes all browser session dimensions when present', () => {
    const identities: RateLimitIdentities = {
      ip: '192.0.2.1',
      deviceId: 'device-123',
      sessionId: 'session-456',
      userId: 'user-789',
    }
    expect(getRateLimitKeyDimensions(identities)).toEqual({
      ip: '192.0.2.1',
      did: 'device-123',
      sid: 'session-456',
      uid: 'user-789',
      email: undefined,
    })
  })

  it('API key path: only IP + apikey dimensions, no browser identities', () => {
    const identities: RateLimitIdentities = {
      ip: '192.0.2.1',
      apiKeyId: 'abcd1234',
      deviceId: 'device-123',
      sessionId: 'session-456',
      userId: 'user-789',
      email: 'alice@example.test',
    }
    expect(getRateLimitKeyDimensions(identities)).toEqual({
      ip: '192.0.2.1',
      apikey: 'abcd1234',
    })
  })

  it('leaves missing session and user dimensions undefined', () => {
    const identities: RateLimitIdentities = {
      ip: '192.0.2.1',
      deviceId: 'device-123',
    }
    expect(getRateLimitKeyDimensions(identities)).toEqual({
      ip: '192.0.2.1',
      did: 'device-123',
      sid: undefined,
      uid: undefined,
      email: undefined,
    })
  })

  it('selects no identity values when no identities are provided', () => {
    expect(getRateLimitKeyDimensions({})).toEqual({
      ip: undefined,
      did: undefined,
      sid: undefined,
      uid: undefined,
      email: undefined,
    })
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
