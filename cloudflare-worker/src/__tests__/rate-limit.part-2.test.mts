import { describe, expect, it } from 'vitest'

import { checkBotRateLimit, checkRateLimit } from '../rate-limit.mts'

describe('checkBotRateLimit', () => {
  it('uses bot-specific binding when configured', async () => {
    const botKeys: string[] = []
    const normalKeys: string[] = []

    const result = await checkBotRateLimit({
      env: {
        RATE_LIMITER_BOT_GET_HEAD: {
          limit: ({ key }) => {
            botKeys.push(key)
            return { success: true }
          },
        },
        RATE_LIMITER_GET_HEAD: {
          limit: ({ key }) => {
            normalKeys.push(key)
            return { success: true }
          },
        },
      },
      method: 'GET',
      pathname: '/api/v1/posts',
      ip: '1.1.1.1',
    })

    expect(result).toBe(true)
    expect(botKeys).toEqual(['bot:api:GET:1.1.1.1'])
    expect(normalKeys).toEqual([])
  })

  it('falls back to normal binding when bot binding is not configured', async () => {
    const keys: string[] = []

    const result = await checkBotRateLimit({
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
    })

    expect(result).toBe(true)
    expect(keys).toEqual(['bot:api:GET:1.1.1.1'])
  })

  it('blocks when bot rate limit is exceeded', async () => {
    const result = await checkBotRateLimit({
      env: {
        RATE_LIMITER_BOT_GET_HEAD: {
          limit: () => ({ success: false }),
        },
      },
      method: 'GET',
      pathname: '/blog',
      ip: '2.2.2.2',
    })

    expect(result).toBe(false)
  })

  it('allows when no bindings are configured', async () => {
    const result = await checkBotRateLimit({
      env: {},
      method: 'GET',
      pathname: '/api/v1/posts',
      ip: '1.1.1.1',
    })

    expect(result).toBe(true)
  })

  it('blocks when ip is null and binding is configured', async () => {
    const result = await checkBotRateLimit({
      env: {
        RATE_LIMITER_BOT_GET_HEAD: {
          limit: () => ({ success: true }),
        },
      },
      method: 'GET',
      pathname: '/api/v1/posts',
      ip: null,
    })

    expect(result).toBe(false)
  })

  it('uses bot mutating binding for POST requests', async () => {
    const botKeys: string[] = []

    await checkBotRateLimit({
      env: {
        RATE_LIMITER_BOT_MUTATING: {
          limit: ({ key }) => {
            botKeys.push(key)
            return { success: true }
          },
        },
      },
      method: 'POST',
      pathname: '/api/v1/posts',
      ip: '1.1.1.1',
    })

    expect(botKeys).toEqual(['bot:api:MUTATING:1.1.1.1'])
  })

  it('falls back to normal mutating binding for bot POST requests', async () => {
    const keys: string[] = []

    await checkBotRateLimit({
      env: {
        RATE_LIMITER_MUTATING: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      method: 'POST',
      pathname: '/api/v1/posts',
      ip: '1.1.1.1',
    })

    expect(keys).toEqual(['bot:api:MUTATING:1.1.1.1'])
  })

  it('shares one bot mutating key across POST, PUT, PATCH, and DELETE', async () => {
    const keys: string[] = []
    const env = {
      RATE_LIMITER_BOT_MUTATING: {
        limit: ({ key }: { key: string }) => {
          keys.push(key)
          return { success: true }
        },
      },
    }

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await checkBotRateLimit({
        env,
        method,
        pathname: '/api/v1/posts',
        ip: '1.1.1.1',
      })
    }

    expect(keys).toEqual(Array(4).fill('bot:api:MUTATING:1.1.1.1'))
  })

  it('uses web area for non-API paths', async () => {
    const keys: string[] = []

    await checkBotRateLimit({
      env: {
        RATE_LIMITER_BOT_GET_HEAD: {
          limit: ({ key }) => {
            keys.push(key)
            return { success: true }
          },
        },
      },
      method: 'GET',
      pathname: '/blog',
      ip: '1.1.1.1',
    })

    expect(keys).toEqual(['bot:web:GET:1.1.1.1'])
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof checkRateLimit)
})
