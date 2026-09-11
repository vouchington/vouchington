import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker fetch handler — static web cache', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('does not cache configured extensionless web HTML routes', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('<!doctype html><script nonce="origin-nonce"></script>')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      CACHED_STATIC_PATHS: '/about',
    }

    const request = new Request('https://voucha.ai/about')

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(request, env, createContext(env))

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('preserves session cookies for configured extensionless web HTML routes', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>((_request: Request) =>
      Promise.resolve(new Response('from web')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      CACHED_STATIC_PATHS: '/about',
    }

    await worker.fetch(
      new Request('https://voucha.ai/about', {
        headers: { cookie: 'dt=device; st=session; other=value' },
      }),
      env,
      createContext(env),
    )

    const originRequest = fetchSpy.mock.calls[0]![0]
    const cookieHeader = originRequest.headers.get('cookie')
    expect(cookieHeader).toContain('dt=')
    expect(cookieHeader).toContain('st=')
    expect(cookieHeader).toContain('other=value')
  })

  it('treats configured extensionless web HTML routes as rate-limited origin routes', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('from web')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      CACHED_STATIC_PATHS: '/about',
      RATE_LIMITER_GET_HEAD: {
        limit: () => ({ success: true }),
      },
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/about'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('treats configured static web assets as fully cached for missing-IP rate limits', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('icon')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const limiter = { limit: vi.fn<VitestLooseMock>(() => ({ success: true })) }

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      CACHED_STATIC_PATHS: '/favicon.ico',
      RATE_LIMITER_GET_HEAD: limiter,
      CACHE_PLACEHOLDER_NONCE: 'test-placeholder-nonce-that-is-at-least-32-characters-long',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/favicon.ico'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(limiter.limit).not.toHaveBeenCalled()
  })

  it.each(['GET', 'HEAD'])(
    'bypasses shared cache for an unknown-bot %s image optimizer request, limits once, and preserves Accept',
    async method => {
      const fetchSpy = vi.fn<VitestLooseMock>(() =>
        Promise.resolve(
          new Response('optimized image', { headers: { 'content-type': 'image/avif' } }),
        ),
      )
      globalThis.fetch = fetchSpy as unknown as typeof fetch

      const botLimiter = vi.fn<VitestLooseMock>(() => ({ success: true }))
      const env: Env = {
        BACKEND_ORIGIN: 'https://backend.example.com',
        WEB_ORIGIN: 'https://web.example.com',
        CACHE_PLACEHOLDER_NONCE: 'test-placeholder-nonce-that-is-at-least-32-characters-long',
        RATE_LIMITER_BOT_GET_HEAD: { limit: botLimiter },
      }

      const response = await worker.fetch(
        new Request('https://voucha.ai/_next/image?url=%2Ficon.svg&w=64&q=75', {
          method,
          headers: {
            accept: 'image/avif,image/webp,*/*',
            'cf-connecting-ip': '1.1.1.1',
            'user-agent': 'MyGenericBot/1.0',
          },
        }),
        env,
        createContext(env),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(botLimiter).toHaveBeenCalledTimes(1)
      expect(fetchSpy.mock.calls[0]![0].headers.get('accept')).toBe('image/avif,image/webp,*/*')
    },
  )

  it.each(['GET', 'HEAD'])(
    'rejects an unknown-bot %s image optimizer request after exactly one bot limit check',
    async method => {
      const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('unexpected')))
      globalThis.fetch = fetchSpy as unknown as typeof fetch
      const botLimiter = vi.fn<VitestLooseMock>(() => ({ success: false }))
      const env: Env = {
        WEB_ORIGIN: 'https://web.example.com',
        RATE_LIMITER_BOT_GET_HEAD: { limit: botLimiter },
      }

      const response = await worker.fetch(
        new Request('https://voucha.ai/_next/image?url=%2Ficon.svg&w=64&q=75', {
          method,
          headers: { 'cf-connecting-ip': '1.1.1.1', 'user-agent': 'MyGenericBot/1.0' },
        }),
        env,
        createContext(env),
      )

      expect(response.status).toBe(429)
      expect(response.headers.get('x-voucha-cache')).toBeNull()
      expect(botLimiter).toHaveBeenCalledTimes(1)
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )
})
