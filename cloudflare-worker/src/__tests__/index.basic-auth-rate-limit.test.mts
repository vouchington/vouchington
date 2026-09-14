import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

const baseEnv: Env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  WEB_ORIGIN: 'https://web.example.com',
}

const CREDS = 'alice:hunter2'

const encodeCreds = (userPass: string) => `Basic ${btoa(userPass)}`

describe('staging basic auth rate limiting', () => {
  beforeEach(() => {
    setupMemoryCaches()
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('rate limiter protects basic-auth responses', async () => {
    const rateLimiterCalls: string[] = []
    const env: Env = {
      ...baseEnv,
      BASIC_AUTH_CREDENTIALS: CREDS,
      RATE_LIMITER_GET_HEAD: {
        limit: ({ key }) => {
          rateLimiterCalls.push(key)
          return { success: false }
        },
      },
    }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(429)
    expect(rateLimiterCalls).toEqual(['anon:web:GET:1.1.1.1'])
  })

  it('rate limiter protects basic-auth responses from spoofed bot user agents', async () => {
    const rateLimiterCalls: string[] = []
    const env: Env = {
      ...baseEnv,
      BASIC_AUTH_CREDENTIALS: CREDS,
      RATE_LIMITER_GET_HEAD: {
        limit: ({ key }) => {
          rateLimiterCalls.push(key)
          return { success: false }
        },
      },
    }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(429)
    expect(rateLimiterCalls).toEqual(['anon:web:GET:1.1.1.1'])
  })

  it('returns 401 when the rate limiter allows a basic-auth response', async () => {
    const rateLimiterCalls: string[] = []
    const env: Env = {
      ...baseEnv,
      BASIC_AUTH_CREDENTIALS: CREDS,
      RATE_LIMITER_GET_HEAD: {
        limit: ({ key }) => {
          rateLimiterCalls.push(key)
          return { success: true }
        },
      },
    }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(401)
    expect(rateLimiterCalls).toEqual(['anon:web:GET:1.1.1.1'])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('rate limiter rejects correct credentials before an inline response can pass', async () => {
    const rateLimiterCalls: string[] = []
    const env: Env = {
      ...baseEnv,
      BASIC_AUTH_CREDENTIALS: CREDS,
      RATE_LIMITER_GET_HEAD: {
        limit: ({ key }) => {
          rateLimiterCalls.push(key)
          return { success: false }
        },
      },
    }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/robots.txt', {
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          authorization: encodeCreds('alice:hunter2'),
        },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(429)
    expect(rateLimiterCalls).toEqual(['anon:web:GET:1.1.1.1'])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('preserves the server-action limiter after valid basic auth consumes the generic bucket', async () => {
    const rateLimiterCalls: string[] = []
    const limiter = {
      limit: ({ key }: { key: string }) => {
        rateLimiterCalls.push(key)
        return { success: true }
      },
    }
    const env: Env = {
      ...baseEnv,
      BASIC_AUTH_CREDENTIALS: CREDS,
      RATE_LIMITER_MUTATING: limiter,
      RATE_LIMITER_SERVER_ACTION: limiter,
    }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          authorization: encodeCreds('alice:hunter2'),
          'next-action': 'action-id',
        },
        body: '',
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(rateLimiterCalls).toEqual([
      'anon:web:MUTATING:1.1.1.1',
      'server-action:web:MUTATING:1.1.1.1',
    ])
  })
})
