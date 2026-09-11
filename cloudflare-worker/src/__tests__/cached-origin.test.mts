import { afterEach, describe, expect, it, vi } from 'vitest'
import { CachedOrigin } from '../cached-origin.mts'
import type { CachedOriginProps, Env } from '../types.mts'

const buildOrigin = (props: CachedOriginProps, env: Env = {}) =>
  new CachedOrigin({ props, waitUntil: () => {}, passThroughOnException: () => {} }, env)

const captureOriginFetch = (): (() => Request | undefined) => {
  let capturedRequest: Request | undefined
  globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) => {
    capturedRequest = request
    return Promise.resolve(new Response('ok'))
  }) as unknown as typeof fetch
  return () => capturedRequest
}

describe('CachedOrigin.fetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 404 for unsupported sitemap paths without fetching origin', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const origin = buildOrigin(
      { audience: 'static', isRsc: false },
      { SITEMAPS_ORIGIN: 'https://sitemaps.example.com' },
    )
    const response = await origin.fetch(new Request('https://voucha.ai/sitemaps/meta/bad.json'))

    expect(response.status).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns a 502 when the target origin is not configured', async () => {
    const origin = buildOrigin({ audience: 'anon', isRsc: false }, {})
    const response = await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))

    expect(response.status).toBe(502)
  })

  it('strips cookies from the origin request regardless of what the dispatch request carries', async () => {
    const captured = captureOriginFetch()

    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      { BACKEND_ORIGIN: 'https://backend.example.com' },
    )
    await origin.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { cookie: 'st=leaked; dt=leaked' },
      }),
    )

    expect(captured()?.headers.get('cookie')).toBeNull()
  })

  it('forwards the placeholder nonce and a CSP header only for target === "web"', async () => {
    const captured = captureOriginFetch()

    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      { WEB_ORIGIN: 'https://web.example.com', CACHE_PLACEHOLDER_NONCE: 'the-placeholder-secret' },
    )
    await origin.fetch(new Request('https://voucha.ai/about'))

    expect(captured()?.headers.get('x-nonce')).toBe('the-placeholder-secret')
    expect(captured()?.headers.get('content-security-policy')).toContain(
      'nonce-the-placeholder-secret',
    )
  })

  it('does not set a CSP/nonce header for a non-web target', async () => {
    const captured = captureOriginFetch()

    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      {
        BACKEND_ORIGIN: 'https://backend.example.com',
        CACHE_PLACEHOLDER_NONCE: 'the-placeholder-secret',
      },
    )
    await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))

    expect(captured()?.headers.get('x-nonce')).toBeNull()
    expect(captured()?.headers.get('content-security-policy')).toBeNull()
  })

  it('marks a non-cacheable response (set-cookie present) private/no-store without discarding it', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('with cookie', { headers: { 'set-cookie': 'session=abc; Path=/' } }),
      ),
    ) as unknown as typeof fetch

    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      { BACKEND_ORIGIN: 'https://backend.example.com' },
    )
    const response = await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toBe('with cookie')
  })

  it('sets a cache-control TTL for the audience and strips shared-cache-volatile headers', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('ok', { headers: { 'content-security-policy': "script-src 'nonce-stale'" } }),
      ),
    ) as unknown as typeof fetch

    const origin = buildOrigin(
      { audience: 'bot', isRsc: false },
      { BACKEND_ORIGIN: 'https://backend.example.com', BOT_CACHE_TTL_SECONDS: '86400' },
    )
    const response = await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))

    expect(response.headers.get('cache-control')).toContain('max-age=86400')
    expect(response.headers.get('content-security-policy')).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('gates on the bot limiter only when the dispatch-only bot-tier header is "unknown", stripping it before the origin request', async () => {
    const deniedFetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = deniedFetch as unknown as typeof fetch
    const denied = buildOrigin(
      { audience: 'bot', isRsc: false },
      {
        BACKEND_ORIGIN: 'https://backend.example.com',
        RATE_LIMITER_BOT_GET_HEAD: { limit: () => ({ success: false }) },
      },
    )
    const dispatchHeaders = {
      'x-voucha-dispatch-bot-tier': 'unknown',
      'x-voucha-dispatch-ip': '1.1.1.1',
    }
    const deniedResponse = await denied.fetch(
      new Request('https://voucha.ai/api/v1/posts', { headers: dispatchHeaders }),
    )
    expect(deniedResponse.status).toBe(429)
    expect(deniedFetch).not.toHaveBeenCalled()

    const captured = captureOriginFetch()
    const allowed = buildOrigin(
      { audience: 'bot', isRsc: false },
      {
        BACKEND_ORIGIN: 'https://backend.example.com',
        RATE_LIMITER_BOT_GET_HEAD: { limit: () => ({ success: true }) },
      },
    )
    const allowedResponse = await allowed.fetch(
      new Request('https://voucha.ai/api/v1/posts', { headers: dispatchHeaders }),
    )
    expect(allowedResponse.status).toBe(200)
    expect(captured()?.headers.get('x-voucha-dispatch-bot-tier')).toBeNull()
    expect(captured()?.headers.get('x-voucha-dispatch-ip')).toBeNull()
  })

  // Proves RATE_LIMITER_BOT_GET_HEAD is never consulted without the dispatch-only header,
  // even though it's configured here to deny.
  it('does not run the bot limiter when the dispatch-only header is absent', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('ok')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      {
        BACKEND_ORIGIN: 'https://backend.example.com',
        RATE_LIMITER_BOT_GET_HEAD: { limit: () => ({ success: false }) },
      },
    )
    const response = await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('forwards the dispatch IP as x-forwarded-for, omitting it when absent', async () => {
    const captured = captureOriginFetch()
    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      { BACKEND_ORIGIN: 'https://backend.example.com' },
    )

    await origin.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { 'x-voucha-dispatch-ip': '5.6.7.8' },
      }),
    )
    expect(captured()?.headers.get('x-forwarded-for')).toBe('5.6.7.8')

    await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))
    expect(captured()?.headers.get('x-forwarded-for')).toBeNull()
  })

  // A shared fill must never be compressed (Vary is stripped unconditionally above), so a
  // compressed fill would let one client's encoding-selected variant serve every future client.
  it('always requests identity encoding from origin, even when the dispatch request offers compression', async () => {
    const captured = captureOriginFetch()

    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      { BACKEND_ORIGIN: 'https://backend.example.com' },
    )
    await origin.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { 'accept-encoding': 'br, gzip' },
      }),
    )

    expect(captured()?.headers.get('accept-encoding')).toBe('identity')
  })

  it('forwards x-request-id to origin, falling back to a generated id when absent', async () => {
    const captured = captureOriginFetch()
    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      { BACKEND_ORIGIN: 'https://backend.example.com' },
    )

    await origin.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { 'x-request-id': 'client-visible-id' },
      }),
    )
    expect(captured()?.headers.get('x-request-id')).toBe('client-visible-id')

    await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))
    expect(captured()?.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('sets a Cache-Tag header derived from the dispatched path, falling back to the html class tag', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok', { headers: { 'content-type': 'text/html' } })),
    ) as unknown as typeof fetch

    // /user/alice is a web-rendered detail page — needs WEB_ORIGIN (not BACKEND_ORIGIN) so
    // resolveOrigin() succeeds and the request reaches the Cache-Tag-setting code below.
    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      { WEB_ORIGIN: 'https://web.example.com' },
    )
    const taggedResponse = await origin.fetch(new Request('https://voucha.ai/user/alice'))
    expect(taggedResponse.headers.get('Cache-Tag')).toBe('user:alice')

    const fallbackResponse = await origin.fetch(new Request('https://voucha.ai/'))
    expect(fallbackResponse.headers.get('Cache-Tag')).toBe('html')
  })

  it('computes the TTL from ctx.props.audience, not from the request', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      ANON_CACHE_TTL_SECONDS: '30',
      BOT_CACHE_TTL_SECONDS: '86400',
    }

    const anonResponse = await buildOrigin({ audience: 'anon', isRsc: false }, env).fetch(
      new Request('https://voucha.ai/api/v1/posts'),
    )
    const botResponse = await buildOrigin({ audience: 'bot', isRsc: false }, env).fetch(
      new Request('https://voucha.ai/api/v1/posts'),
    )

    expect(anonResponse.headers.get('cache-control')).toContain('max-age=30')
    expect(botResponse.headers.get('cache-control')).toContain('max-age=86400')
  })
})
