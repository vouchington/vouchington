import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker fetch handler — bot headers, rate limiting, noindex, and cache-control', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('x-voucha-bot-tier is set to known for recognized bots', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const request = new Request('https://voucha.ai/blog', {
      headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
    })
    Object.defineProperty(request, 'cf', {
      value: { botManagement: { verifiedBot: true } },
    })
    const response = await worker.fetch(request, env, createContext(env))

    expect(response.headers.get('x-voucha-bot-tier')).toBe('known')
  })

  it('x-voucha-bot-tier downgrades spoofed known bot UAs to unknown', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/blog', {
        headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
      }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-bot-tier')).toBe('unknown')
  })

  it('x-voucha-bot-tier is set to unknown for unrecognized bots', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/blog', {
        headers: { 'user-agent': 'MyGenericBot/1.0' },
      }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-bot-tier')).toBe('unknown')
  })

  it('x-voucha-bot-tier is not set for human traffic', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/blog', {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-bot-tier')).toBeNull()
  })

  it('unknown bot is rate-limited post-cache on MISS', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      RATE_LIMITER_BOT_GET_HEAD: { limit: () => ({ success: false }) },
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/blog', {
        headers: { 'user-agent': 'MyGenericBot/1.0', 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(429)
  })

  it('unknown bot passes pre-cache rate limit and hits origin on MISS', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch
    globalThis.fetch = fetchSpy

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      // Pre-cache limiter configured but should be skipped for unknown bots
      RATE_LIMITER_GET_HEAD: { limit: () => ({ success: false }) },
      // Bot limiter allows through
      RATE_LIMITER_BOT_GET_HEAD: { limit: () => ({ success: true }) },
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/blog', {
        headers: { 'user-agent': 'MyGenericBot/1.0', 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('adds x-robots-tag noindex header when NOINDEX=true', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      NOINDEX: 'true',
    }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/'),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
  })

  it('does not add x-robots-tag header when NOINDEX is unset', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(new Request('https://voucha.ai/'), env, createContext(env))

    expect(response.headers.get('x-robots-tag')).toBeNull()
  })

  it('does not add x-robots-tag header when NOINDEX=false', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      NOINDEX: 'false',
    }

    const response = await worker.fetch(new Request('https://voucha.ai/'), env, createContext(env))

    expect(response.headers.get('x-robots-tag')).toBeNull()
  })

  it('cache-control includes TTL, revalidation, and bounded origin-error staleness', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      env,
      createContext(env),
    )

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=30, stale-while-revalidate=60, stale-if-error=86400',
    )
  })
})
