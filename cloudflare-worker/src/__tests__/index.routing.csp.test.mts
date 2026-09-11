import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
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

  it('does not set content-security-policy on backend routes', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const apiResponse = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts'),
      env,
      createContext(env),
    )
    expect(apiResponse.headers.get('content-security-policy')).toBeNull()

    const infraResponse = await worker.fetch(
      new Request('https://voucha.ai/infra/ping'),
      env,
      createContext(env),
    )
    expect(infraResponse.headers.get('content-security-policy')).toBeNull()
  })

  it('includes CSP_ASSET_ORIGIN in CSP when set', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      CSP_ASSET_ORIGIN: 'https://cdn.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/about'),
      env,
      createContext(env),
    )

    const csp = response.headers.get('content-security-policy')
    expect(csp).toMatch(/script-src [^;]*https:\/\/cdn\.example\.com/)
    expect(csp).toMatch(/style-src [^;]*https:\/\/cdn\.example\.com/)
  })

  it('omits asset origin from CSP when CSP_ASSET_ORIGIN is not set', async () => {
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
    expect(csp).not.toContain('cdn.example.com')
  })

  it('does not forward x-cf-worker-secret to web origin', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((req: Request) => {
      capturedRequest = req
      return Promise.resolve(new Response('from web'))
    }) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      CF_WORKER_SECRET: 'super-secret',
    }

    await worker.fetch(new Request('https://voucha.ai/about'), env, createContext(env))

    expect(capturedRequest?.headers.get('x-cf-worker-secret')).toBeNull()
  })

  it('forwards CSP nonce policy to web origin and includes it in response CSP', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((req: Request) => {
      capturedRequest = req
      return Promise.resolve(new Response('from web'))
    }) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/about'),
      env,
      createContext(env),
    )
    const nonce = capturedRequest?.headers.get('x-nonce')
    const forwardedCsp = capturedRequest?.headers.get('content-security-policy')
    const responseCsp = response.headers.get('content-security-policy')

    expect(nonce).toMatch(/^[a-f0-9]{32}$/)
    expect(forwardedCsp).toContain(`'nonce-${nonce}'`)
    expect(responseCsp).toBe(forwardedCsp)
    expect(responseCsp).not.toMatch(/script-src [^;]*'unsafe-inline'/)
  })

  it('strips content-security-policy from shared backend cache entries', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('from backend', {
          headers: {
            'content-security-policy': "script-src 'nonce-stale-backend'",
          },
        }),
      ),
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

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(firstResponse.headers.get('content-security-policy')).toBeNull()
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('content-security-policy')).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('strips content-security-policy from shared static cache entries', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('<urlset />', {
          headers: {
            'content-security-policy': "script-src 'nonce-stale-static'",
          },
        }),
      ),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const env: Env = {
      SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      SITEMAP_CACHE_TTL_SECONDS: '86400',
    }

    const request = new Request('https://voucha.ai/sitemap.xml')

    const firstResponse = await worker.fetch(request, env, createContext(env))
    const secondResponse = await worker.fetch(request, env, createContext(env))

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(firstResponse.headers.get('content-security-policy')).toBeNull()
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(secondResponse.headers.get('content-security-policy')).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not forward x-cf-worker-secret to sitemaps origin', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((req: Request) => {
      capturedRequest = req
      return Promise.resolve(new Response('from sitemaps'))
    }) as unknown as typeof fetch

    const env: Env = {
      SITEMAPS_ORIGIN: 'https://sitemaps.example.com',
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      CF_WORKER_SECRET: 'super-secret',
    }

    await worker.fetch(new Request('https://voucha.ai/sitemap.xml'), env, createContext(env))

    expect(capturedRequest?.headers.get('x-cf-worker-secret')).toBeNull()
  })

  it('does not cache responses with set-cookie headers', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('with cookie', {
          headers: { 'set-cookie': 'session=abc; Path=/' },
        }),
      ),
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

    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    // CachedOrigin explicitly stamps cache-control on non-cacheable responses
    // (defense-in-depth against the platform's own default cache heuristics —
    // see NON_CACHEABLE_HEADERS in cached-origin.mts) rather than leaving it
    // absent as the old caches.default gateway did.
    expect(firstResponse.headers.get('cache-control')).toBe('private, no-store')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not cache 5xx responses', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('error', { status: 500 })),
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

    expect(firstResponse.status).toBe(500)
    expect(firstResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(firstResponse.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(firstResponse.headers.get('cdn-cache-control')).toBe('no-store')
    expect(firstResponse.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(secondResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
