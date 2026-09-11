import { describe, expect, it } from 'vitest'

import { checkBotRateLimit, checkRateLimit } from '../rate-limit.mts'

describe('rate-limit', () => {
  it('skips limiting for fully cached routes', async () => {
    const result = await checkRateLimit({
      env: {},
      method: 'GET',
      pathname: '/sitemap.xml',
      ip: '1.1.1.1',
      isFullyCachedRoute: true,
      botTier: null,
    })

    expect(result).toBe(true)
  })

  it('uses GET/HEAD limiter for read methods', async () => {
    const keys: string[] = []

    const result = await checkRateLimit({
      env: {
        RATE_LIMITER_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      method: 'GET',
      pathname: '/api/v1/posts',
      ip: '1.1.1.1',
      isFullyCachedRoute: false,
      botTier: null,
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['api:GET:1.1.1.1'])
  })

  it('uses the API bucket for mixed-case API paths', async () => {
    const keys: string[] = []

    const result = await checkRateLimit({
      env: {
        RATE_LIMITER_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      method: 'GET',
      pathname: '/API/v1/posts',
      ip: '1.1.1.1',
      isFullyCachedRoute: false,
      botTier: null,
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['api:GET:1.1.1.1'])
  })

  it('blocks when limiter returns unsuccessful response', async () => {
    const result = await checkRateLimit({
      env: {
        RATE_LIMITER_MUTATING: {
          limit: () => ({ success: false }),
        },
      },
      method: 'POST',
      pathname: '/posts',
      ip: '1.1.1.1',
      isFullyCachedRoute: false,
      botTier: null,
    })

    expect(result).toBe(false)
  })

  it('HEAD requests use the same rate-limit bucket as GET', async () => {
    const keys: string[] = []

    await checkRateLimit({
      env: {
        RATE_LIMITER_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      method: 'HEAD',
      pathname: '/api/v1/posts',
      ip: '1.1.1.1',
      isFullyCachedRoute: false,
      botTier: null,
    })

    // HEAD is normalized to GET so it shares the same bucket; a client cannot
    // double the per-IP allowance by alternating GET and HEAD requests.
    expect(keys).toEqual(['api:GET:1.1.1.1'])
  })

  it('blocks when IP is null and rate limiter binding is configured', async () => {
    const result = await checkRateLimit({
      env: {
        RATE_LIMITER_GET_HEAD: {
          limit: () => ({ success: true }),
        },
      },
      method: 'GET',
      pathname: '/api/v1/posts',
      ip: null,
      isFullyCachedRoute: false,
      botTier: null,
    })

    expect(result).toBe(false)
  })

  it('allows when IP is null and no rate limiter binding is configured', async () => {
    const result = await checkRateLimit({
      env: {},
      method: 'GET',
      pathname: '/api/v1/posts',
      ip: null,
      isFullyCachedRoute: false,
      botTier: null,
    })

    expect(result).toBe(true)
  })

  it('skips pre-cache rate limit for unknown bot GET requests', async () => {
    const keys: string[] = []

    const result = await checkRateLimit({
      env: {
        RATE_LIMITER_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      method: 'GET',
      pathname: '/api/v1/posts',
      ip: '1.1.1.1',
      isFullyCachedRoute: false,
      botTier: 'unknown',
    })

    // Unknown bot GETs skip pre-cache limiting; the limiter should not be called.
    expect(result).toBe(true)
    expect(keys).toEqual([])
  })

  it('applies pre-cache rate limit for unknown bot POST requests', async () => {
    const keys: string[] = []

    const result = await checkRateLimit({
      env: {
        RATE_LIMITER_MUTATING: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: false }
          },
        },
      },
      method: 'POST',
      pathname: '/api/v1/posts',
      ip: '1.1.1.1',
      isFullyCachedRoute: false,
      botTier: 'unknown',
    })

    expect(result).toBe(false)
    expect(keys).toEqual(['api:MUTATING:1.1.1.1'])
  })

  it('shares one mutating key across POST, PUT, PATCH, and DELETE', async () => {
    const keys: string[] = []
    const env = {
      RATE_LIMITER_MUTATING: {
        limit: ({ key }: { key: string }) => {
          keys.push(key)
          return { success: true }
        },
      },
    }

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await checkRateLimit({
        env,
        method,
        pathname: '/api/v1/posts',
        ip: '1.1.1.1',
        isFullyCachedRoute: false,
        botTier: null,
      })
    }

    expect(keys).toEqual(Array(4).fill('api:MUTATING:1.1.1.1'))
  })

  it('applies normal rate limit for known bots', async () => {
    const keys: string[] = []

    const result = await checkRateLimit({
      env: {
        RATE_LIMITER_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: false }
          },
        },
      },
      method: 'GET',
      pathname: '/api/v1/posts',
      ip: '1.1.1.1',
      isFullyCachedRoute: false,
      botTier: 'known',
    })

    expect(result).toBe(false)
    expect(keys).toEqual(['api:GET:1.1.1.1'])
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof checkBotRateLimit)
})
