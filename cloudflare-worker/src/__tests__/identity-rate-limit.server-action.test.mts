import { describe, expect, it } from 'vitest'
import { checkIdentityRateLimit } from '../identity-rate-limit.mts'

const baseInput = {
  method: 'GET',
  pathname: '/api/v1/posts',
  ip: '1.2.3.4',
  isFullyCachedRoute: false,
  botTier: null,
} as const

describe('checkIdentityRateLimit — HEAD normalization, blocking, and server-action routing', () => {
  it('normalizes HEAD to GET key', async () => {
    const keys: string[] = []

    const result = await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_ANON_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
      method: 'HEAD',
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['anon:api:GET:1.2.3.4'])
  })

  it('uses the API bucket for mixed-case API paths', async () => {
    const keys: string[] = []

    const result = await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_ANON_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
      pathname: '/API/v1/posts',
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['anon:api:GET:1.2.3.4'])
  })

  it('blocks when rate limit is exceeded', async () => {
    const result = await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_ANON_GET_HEAD: {
          limit: () => ({ success: false }),
        },
      },
      ...baseInput,
    })

    expect(result).toBe(false)
  })

  it('blocks when ip is null and binding is configured', async () => {
    const result = await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_ANON_GET_HEAD: {
          limit: () => ({ success: true }),
        },
      },
      ...baseInput,
      ip: null,
    })

    expect(result).toBe(false)
  })

  it('returns true when ip is null and no bindings are configured', async () => {
    const result = await checkIdentityRateLimit({
      env: {},
      ...baseInput,
      ip: null,
    })

    expect(result).toBe(true)
  })

  it('uses web area for non-API paths', async () => {
    const keys: string[] = []

    await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_ANON_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      method: 'GET',
      pathname: '/some/page',
      ip: '1.2.3.4',
      isFullyCachedRoute: false,
      botTier: null,
    })

    expect(keys).toEqual(['anon:web:GET:1.2.3.4'])
  })

  it('does not use premium binding for pro membership claims at the edge', async () => {
    const keys: string[] = []

    await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_ANON_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
    })

    expect(keys).toEqual(['anon:api:GET:1.2.3.4'])
  })

  it('uses mutating binding (not server-action) for POST without next-action', async () => {
    const keys: string[] = []

    const result = await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_SERVER_ACTION: {
          limit: () => ({ success: false }),
        },
        RATE_LIMITER_ANON_MUTATING: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
      method: 'POST',
      isServerAction: false,
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['anon:api:MUTATING:1.2.3.4'])
  })

  it('ignores server-action classification on GET (defensive — server actions are always POST)', async () => {
    const keys: string[] = []

    const result = await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_SERVER_ACTION: {
          limit: () => ({ success: false }),
        },
        RATE_LIMITER_ANON_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
      method: 'GET',
      isServerAction: true,
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['anon:api:GET:1.2.3.4'])
  })

  it('ignores server-action classification on non-POST mutating methods (server actions are always POST)', async () => {
    const keys: string[] = []

    const result = await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_SERVER_ACTION: {
          limit: () => ({ success: false }),
        },
        RATE_LIMITER_ANON_MUTATING: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
      method: 'PUT',
      pathname: '/some/page',
      isServerAction: true,
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['anon:web:MUTATING:1.2.3.4'])
  })

  it('server-action POST falls back to mutating bucket when RATE_LIMITER_SERVER_ACTION is absent', async () => {
    const keys: string[] = []

    const result = await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_ANON_MUTATING: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      ...baseInput,
      method: 'POST',
      pathname: '/some/page',
      isServerAction: true,
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['anon:web:MUTATING:1.2.3.4'])
  })

  it('keeps API spoof and web Server Action mutation namespaces independent', async () => {
    const keys: string[] = []
    const limiter = {
      limit: ({ key }: { key: string }) => {
        keys.push(key)
        return { success: true }
      },
    }
    const env = {
      RATE_LIMITER_ANON_MUTATING: limiter,
      RATE_LIMITER_SERVER_ACTION: limiter,
    }

    await checkIdentityRateLimit({
      env,
      ...baseInput,
      method: 'POST',
      pathname: '/api/v1/staging-rate-limit-canary',
      isServerAction: false,
    })
    await checkIdentityRateLimit({
      env,
      ...baseInput,
      method: 'POST',
      pathname: '/__staging-rate-limit-canary',
      isServerAction: true,
    })

    expect(keys).toEqual([
      'anon:api:MUTATING:1.2.3.4',
      'anon:web:MUTATING:1.2.3.4',
      'server-action:web:MUTATING:1.2.3.4',
    ])
  })

  it('applies normal pre-cache limit for known bots', async () => {
    const keys: string[] = []

    const result = await checkIdentityRateLimit({
      env: {
        RATE_LIMITER_ANON_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: false }
          },
        },
      },
      ...baseInput,
      botTier: 'known',
    })

    expect(result).toBe(false)
    expect(keys).toEqual(['anon:api:GET:1.2.3.4'])
  })
})
