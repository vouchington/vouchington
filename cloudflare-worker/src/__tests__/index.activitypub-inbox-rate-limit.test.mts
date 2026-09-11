import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

function rejectingRateLimiter(): NonNullable<Env['RATE_LIMITER_MUTATING']> {
  return { limit: () => ({ success: false }) }
}

function allowingRateLimiter(): NonNullable<Env['RATE_LIMITER_MUTATING']> {
  return { limit: () => ({ success: true }) }
}

describe('ActivityPub inbox edge rate-limit ownership', () => {
  beforeEach(() => {
    setupMemoryCaches()
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('accepted', { status: 202 })),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('exempts exact POST /ap/inbox from the generic mutating limiter', async () => {
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_MUTATING: rejectingRateLimiter(),
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/ap/inbox', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '1.1.1.1' },
        body: '{}',
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(202)
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })

  it('exempts exact POST /ap/inbox from the unknown-bot mutating limiter', async () => {
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_MUTATING: rejectingRateLimiter(),
      RATE_LIMITER_BOT_MUTATING: rejectingRateLimiter(),
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/ap/inbox', {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          'user-agent': 'RemoteFederationBot/1.0',
        },
        body: '{}',
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(202)
    expect(response.headers.get('x-voucha-bot-tier')).toBe('unknown')
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })

  it('exempts exact POST /ap/inbox when rejecting bindings exist without an edge IP', async () => {
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_MUTATING: rejectingRateLimiter(),
      RATE_LIMITER_BOT_MUTATING: rejectingRateLimiter(),
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/ap/inbox', {
        method: 'POST',
        headers: { 'user-agent': 'RemoteFederationBot/1.0' },
        body: '{}',
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(202)
    expect(response.headers.get('x-voucha-bot-tier')).toBe('unknown')
    expect(globalThis.fetch).toHaveBeenCalledOnce()
  })

  it('rejects a neighboring unknown-bot POST without an edge IP before origin', async () => {
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_MUTATING: rejectingRateLimiter(),
      RATE_LIMITER_BOT_MUTATING: rejectingRateLimiter(),
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/ap/inbox/neighbor', {
        method: 'POST',
        headers: { 'user-agent': 'RemoteFederationBot/1.0' },
        body: '{}',
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it.each(['/ap/inbox/neighbor', '/ap/inbox/'])(
    'keeps neighboring POST %s subject to the generic mutating limiter',
    async pathname => {
      const env: Env = {
        BACKEND_ORIGIN: 'https://backend.example.com',
        WEB_ORIGIN: 'https://web.example.com',
        RATE_LIMITER_MUTATING: rejectingRateLimiter(),
      }

      const response = await worker.fetch(
        new Request(`https://voucha.ai${pathname}`, {
          method: 'POST',
          headers: { 'cf-connecting-ip': '1.1.1.1' },
          body: '{}',
        }),
        env,
        createContext(env),
      )

      expect(response.status).toBe(429)
      expect(globalThis.fetch).not.toHaveBeenCalled()
    },
  )

  it('keeps wrong-method GET /ap/inbox subject to the generic GET limiter', async () => {
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_GET_HEAD: rejectingRateLimiter(),
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/ap/inbox', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(429)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('keeps an unknown-bot neighboring POST subject to its bot mutating limiter', async () => {
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_MUTATING: allowingRateLimiter(),
      RATE_LIMITER_BOT_MUTATING: rejectingRateLimiter(),
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/ap/inbox/neighbor', {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          'user-agent': 'RemoteFederationBot/1.0',
        },
        body: '{}',
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(429)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
