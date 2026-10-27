import { describe, expect, it } from 'vitest'
import { checkEdgeBuckets } from '@vouchington/rate-limit/edge'
import { getIdentityRateLimitBuckets } from '../identity-rate-limit.mts'

const checkConfiguredIdentityBuckets = (input: Parameters<typeof getIdentityRateLimitBuckets>[0]) =>
  checkEdgeBuckets(getIdentityRateLimitBuckets(input), input.ip)

const baseInput = {
  method: 'GET',
  pathname: '/api/v1/posts',
  ip: '1.2.3.4',
  isFullyCachedRoute: false,
  botTier: null,
} as const

describe('checkConfiguredIdentityBuckets', () => {
  it('skips limiting for fully cached routes', async () => {
    const result = await checkConfiguredIdentityBuckets({
      env: {
        RATE_LIMITER_ANON_GET_HEAD: { limit: async () => ({ success: false }) },
      },
      ...baseInput,
      isFullyCachedRoute: true,
    })

    expect(result).toBe(true)
  })

  it('skips pre-cache limiting for unknown bot GET requests', async () => {
    const result = await checkConfiguredIdentityBuckets({
      env: {
        RATE_LIMITER_ANON_GET_HEAD: { limit: async () => ({ success: false }) },
      },
      ...baseInput,
      botTier: 'unknown',
    })

    expect(result).toBe(true)
  })

  it('applies anonymous pre-cache limiting to unknown bot POST requests', async () => {
    const keys: string[] = []

    const result = await checkConfiguredIdentityBuckets({
      env: {
        RATE_LIMITER_ANON_MUTATING: {
          limit: async ({ key }) => {
            keys.push(key)
            return { success: false }
          },
        },
      },
      ...baseInput,
      method: 'POST',
      botTier: 'unknown',
    })

    expect(result).toBe(false)
    expect(keys).toEqual(['anon:api:MUTATING:1.2.3.4'])
  })

  it('returns true when no bindings are configured', async () => {
    const result = await checkConfiguredIdentityBuckets({
      env: {},
      ...baseInput,
    })

    expect(result).toBe(true)
  })

  it('uses anon binding for unauthenticated request', async () => {
    const keys: string[] = []

    const result = await checkConfiguredIdentityBuckets({
      env: {
        RATE_LIMITER_ANON_GET_HEAD: {
          limit: async ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['anon:api:GET:1.2.3.4'])
  })

  it('falls back to shared GET/HEAD binding when tier-specific binding is absent', async () => {
    const keys: string[] = []

    const result = await checkConfiguredIdentityBuckets({
      env: {
        RATE_LIMITER_GET_HEAD: {
          limit: async ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
    })

    expect(result).toBe(true)
    // Key is still prefixed with tier even when using the shared binding
    expect(keys).toEqual(['anon:api:GET:1.2.3.4'])
  })

  it('falls back to shared mutating binding for POST when tier-specific binding is absent', async () => {
    const keys: string[] = []

    const result = await checkConfiguredIdentityBuckets({
      env: {
        RATE_LIMITER_MUTATING: {
          limit: async ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
      method: 'POST',
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['anon:api:MUTATING:1.2.3.4'])
  })

  it('uses mutating binding for POST requests', async () => {
    const keys: string[] = []

    const result = await checkConfiguredIdentityBuckets({
      env: {
        RATE_LIMITER_ANON_MUTATING: {
          limit: async ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
      method: 'POST',
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['anon:api:MUTATING:1.2.3.4'])
  })

  it('shares one mutating key across POST, PUT, PATCH, and DELETE', async () => {
    const keys: string[] = []
    const env = {
      RATE_LIMITER_ANON_MUTATING: {
        limit: async ({ key }: { key: string }) => {
          keys.push(key)
          return { success: true }
        },
      },
    }

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await checkConfiguredIdentityBuckets({ ...baseInput, env, method })
    }

    expect(keys).toEqual(Array(4).fill('anon:api:MUTATING:1.2.3.4'))
  })
})
