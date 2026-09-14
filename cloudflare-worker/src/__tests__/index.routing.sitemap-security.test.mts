import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker fetch handler — routing and caching', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('routes sitemap traffic to s3, strips cookies, and preserves gzip headers', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      capturedRequest = request
      return Promise.resolve(
        new Response('compressed', {
          headers: {
            'content-encoding': 'gzip',
          },
        }),
      )
    }) as unknown as typeof fetch

    const env: Env = {
      SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }

    const firstResponse = await worker.fetch(
      new Request('https://voucha.ai/sitemaps/discussion/2026-03-04/3.xml', {
        headers: {
          cookie: 'st=session; dt=device; foo=bar',
        },
      }),
      env,
      createContext(env),
    )
    const secondResponse = await worker.fetch(
      new Request('https://voucha.ai/sitemaps/discussion/2026-03-04/3.xml'),
      env,
      createContext(env),
    )

    expect(capturedRequest?.url).toBe(
      'https://sitemaps.example.com/posts/2026/03/04/discussion/3.xml',
    )
    expect(capturedRequest?.headers.get('cookie')).toBeNull()
    expect(capturedRequest?.headers.get('x-cf-worker-secret')).toBeNull()
    expect(firstResponse.headers.get('content-encoding')).toBe('gzip')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
  })

  it('canonicalizes sitemap query strings for cache key and origin request', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      return Promise.resolve(new Response(request.url))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }

    const request = new Request('https://voucha.ai/sitemaps/discussion.xml?x=1&y=2')

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(
      new Request('https://voucha.ai/sitemaps/discussion.xml?z=9'),
      env,
      createContext(env),
    )

    expect(await firstResponse.text()).toBe(
      'https://sitemaps.example.com/sitemaps/types/discussion.xml',
    )
    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['unsupported path', 'https://voucha.ai/sitemaps/meta/posts-tracked-range.json'],
    ['encoded traversal', 'https://voucha.ai/sitemaps/%2e%2e%2fetc%2fpasswd.xml'],
    ['impossible date', 'https://voucha.ai/sitemaps/discussion/2026-02-30/index.xml'],
  ])('returns 404 for %s without fetching origin', async (_name, requestUrl) => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('from sitemaps')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(new Request(requestUrl), env, createContext(env))

    expect(response.status).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('routes /infra/* to backend', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      const url = new URL(request.url)
      return Promise.resolve(new Response(`from:${url.host}`))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/infra/ping'),
      env,
      createContext(env),
    )

    expect(await response.text()).toBe('from:backend.example.com')
  })

  it('falls /images/* through to the web origin (the worker is no longer in the image path; DNS for images.voucha.ai points directly at CloudFront)', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      const url = new URL(request.url)
      return Promise.resolve(new Response(`from:${url.host}`))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/images/abc.jpg?w=400'),
      env,
      createContext(env),
    )

    expect(await response.text()).toBe('from:web.example.com')
  })

  it('does not cache 4xx responses', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('not found', { status: 404 })),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
    }

    const request = new Request('https://voucha.ai/api/v1/posts')

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(request, env, createContext(env))

    expect(firstResponse.status).toBe(404)
    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    // Non-2xx responses are marked no-store so shared caches never serve stale errors.
    expect(firstResponse.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(firstResponse.headers.get('cdn-cache-control')).toBe('no-store')
    expect(firstResponse.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('caches anonymous 204 responses without trying to copy a body', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
    }

    const firstResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      env,
      createContext(env),
    )
    const secondResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      env,
      createContext(env),
    )

    expect(firstResponse.status).toBe(204)
    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.status).toBe(204)
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('forwards x-cf-worker-secret to backend origin', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((req: Request) => {
      capturedRequest = req
      return Promise.resolve(new Response('from backend'))
    }) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      CF_WORKER_SECRET: 'super-secret',
    }

    await worker.fetch(new Request('https://voucha.ai/api/v1/posts'), env, createContext(env))

    expect(capturedRequest?.headers.get('x-cf-worker-secret')).toBe('super-secret')
  })

  it('attaches security headers to normal (non-101) responses', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  })

  it('sets content-security-policy on web routes', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/about'),
      env,
      createContext(env),
    )

    const csp = response.headers.get('content-security-policy')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).toContain("object-src 'none'")
  })
})
