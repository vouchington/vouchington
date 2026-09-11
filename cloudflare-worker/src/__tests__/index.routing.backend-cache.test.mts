import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import worker from '../index.mts'

import { createSignedDeviceJwt, createSignedSessionJwt } from '../auth/test-jwt-fixtures.mts'

import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'

import type { Env } from '../types.mts'

describe('worker fetch handler — routing and caching', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('routes api traffic to backend and caches anonymous responses', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      const url = new URL(request.url)
      return Promise.resolve(new Response(`from:${url.host}`))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
      CACHED_STATIC_PATHS: '/favicon.ico,/robots.txt',
    }

    const request = new Request('https://voucha.ai/api/v1/posts', {
      headers: {
        cookie: 'dt=anonymous',
      },
    })

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(request, env, createContext(env))

    expect(await firstResponse.text()).toBe('from:backend.example.com')
    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    // Security headers must be applied even to dispatched (cacheable) responses (added in the outer fetch handler).
    expect(secondResponse.headers.get('x-content-type-options')).toBe('nosniff')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('falls apex sideload requests through to the web origin', async () => {
    let capturedRequest: Request | undefined
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      capturedRequest = request
      return Promise.resolve(new Response('web 404', { status: 404 }))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }

    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')
    const request = new Request('https://voucha.ai/sideload/image/test.jpg', {
      headers: {
        accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
    })

    const response = await worker.fetch(request, env, context)

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('web 404')
    expect(dispatchSpy).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(capturedRequest?.url).toBe('https://web.example.com/sideload/image/test.jpg')
    expect(capturedRequest?.headers.get('accept')).toBe('image/avif,image/webp,image/*,*/*;q=0.8')
  })

  it('normalizes the canonical dispatch URL so requests differing only by marketing params reach origin identically', async () => {
    // Workers Cache keys the shared entry by (entrypoint, canonical URL, ctx.props) — there is
    // no real platform cache in this mock harness (createContext constructs a fresh CachedOrigin
    // per dispatch and always runs it live), so this asserts the URL-normalization behavior
    // itself rather than a HIT/MISS call count: both requests must reach origin with an
    // identical, tracking-param-stripped, sorted query string.
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      const url = new URL(request.url)
      return Promise.resolve(new Response(`query:${url.search}`))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }

    const firstResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts?q=cards&utm_source=newsletter'),
      env,
      createContext(env),
    )
    const secondResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts?fbclid=abc&q=cards'),
      env,
      createContext(env),
    )

    expect(await firstResponse.text()).toBe('query:?q=cards')
    expect(await secondResponse.text()).toBe('query:?q=cards')
    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not cache private backend responses', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('private rss', {
          headers: { 'cache-control': 'private, max-age=300' },
        }),
      ),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }

    const request = new Request('https://voucha.ai/rss/posts?apikey=secret')

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(request, env, createContext(env))

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(firstResponse.headers.get('no-vary-search')).toBeNull()
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it.each([
    '/api/v1/my/profile',
    '/api/v1/me/individual',
    '/api/v1/feeds/posts/follow_users',
    '/api/v1/bookmarks/post/abc/save',
    '/api/v1/auth/me',
    '/api/v1/auth/sessions',
    '/api/v1/session',
    '/api/v1/recommended-topics',
    '/api/v1/agent-responses/response-123',
    '/api/v1/agent-responses/response-123/stream',
    '/api/v1/posts/comment-abc/ancestors',
  ])('bypasses CachedOrigin for private backend route %s', async pathname => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('private route', {
          headers: { 'cache-control': 'public, max-age=300' },
        }),
      ),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }
    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')

    const response = await worker.fetch(new Request(`https://voucha.ai${pathname}`), env, context)

    expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(response.headers.get('cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(dispatchSpy).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('fails closed to BYPASS for anonymous web documents when no placeholder nonce is configured', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('from:web')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/plans'),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
    // The old caches.default no-vary-search response header is retired — Workers Cache
    // normalizes the dispatch URL itself (see cache-no-vary-search.mts), and this branch
    // never dispatches at all (no CACHE_PLACEHOLDER_NONCE configured).
    expect(response.headers.get('no-vary-search')).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('strips anonymous cookies before populating the shared backend cache', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      return Promise.resolve(new Response(request.headers.get('cookie') ?? 'no-cookie'))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }

    const firstResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { cookie: 'tracking_id=user-a; theme=dark' },
      }),
      env,
      createContext(env),
    )
    const secondResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { cookie: 'tracking_id=user-b; theme=light' },
      }),
      env,
      createContext(env),
    )

    expect(await firstResponse.text()).toBe('no-cookie')
    expect(await secondResponse.text()).toBe('no-cookie')
    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('strips bot cookies before populating the shared backend cache', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      return Promise.resolve(new Response(request.headers.get('cookie') ?? 'no-cookie'))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }

    const firstResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: {
          'user-agent': 'ExampleBot/1.0',
          cookie: 'tracking_id=bot-a; preview=one',
        },
      }),
      env,
      createContext(env),
    )
    const secondResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: {
          'user-agent': 'ExampleBot/1.0',
          cookie: 'tracking_id=bot-b; preview=two',
        },
      }),
      env,
      createContext(env),
    )

    expect(await firstResponse.text()).toBe('no-cookie')
    expect(await secondResponse.text()).toBe('no-cookie')
    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof createSignedDeviceJwt)
  void (0 as unknown as typeof createSignedSessionJwt)
})
