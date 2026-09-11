import { afterEach, describe, expect, it, vi } from 'vitest'
import { CachedOrigin } from '../cached-origin.mts'
import type { CachedOriginProps, Env } from '../types.mts'

const buildOrigin = (props: CachedOriginProps, env: Env) =>
  new CachedOrigin({ props, waitUntil: () => {}, passThroughOnException: () => {} }, env)

describe('CachedOrigin web-document validation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['missing', undefined],
    ['invalid', 'text/htmlx'],
    ['non-HTML', 'application/json'],
  ])(
    'rejects a successful extensionless response with %s content type before emitting cacheable headers',
    async (_label, contentType) => {
      const headers = contentType ? { 'content-type': contentType } : undefined
      globalThis.fetch = vi.fn<VitestLooseMock>(() =>
        Promise.resolve(new Response('origin body', { headers })),
      ) as unknown as typeof fetch
      const origin = buildOrigin(
        { audience: 'anon', isRsc: false },
        {
          WEB_ORIGIN: 'https://web.example.com',
          CACHE_PLACEHOLDER_NONCE: 'placeholder-secret-at-least-32-chars',
        },
      )

      const response = await origin.fetch(new Request('https://voucha.ai/about'))

      expect(response.status).toBe(502)
      expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
      expect(response.headers.get('cache-tag')).toBeNull()
      expect(await response.json()).toEqual({ message: 'Bad Gateway', code: 'BAD_GATEWAY' })
    },
  )

  it.each(['/opengraph-image', '/landing/alice/twitter-image'])(
    'preserves a successful extensionless Next.js image response for %s',
    async path => {
      const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
      globalThis.fetch = vi.fn<VitestLooseMock>(() =>
        Promise.resolve(new Response(imageBytes, { headers: { 'content-type': 'image/png' } })),
      ) as unknown as typeof fetch

      const response = await buildOrigin(
        { audience: 'anon', isRsc: false },
        { WEB_ORIGIN: 'https://web.example.com' },
      ).fetch(new Request(new URL(path, 'https://voucha.ai')))

      expect(response.status).toBe(200)
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(imageBytes)
    },
  )

  it('accepts an exact case-insensitive HTML media type with parameters', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('<html></html>', {
          headers: { 'content-type': 'Text/HTML; Charset=UTF-8' },
        }),
      ),
    ) as unknown as typeof fetch

    const response = await buildOrigin(
      { audience: 'anon', isRsc: false },
      { WEB_ORIGIN: 'https://web.example.com' },
    ).fetch(new Request('https://voucha.ai/about'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('public, max-age=')
    expect(response.headers.get('cache-tag')).toBe('html')
  })

  it.each([204, 205])('preserves an intentionally empty %s response', async status => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response(null, { status })),
    ) as unknown as typeof fetch

    const response = await buildOrigin(
      { audience: 'anon', isRsc: false },
      { WEB_ORIGIN: 'https://web.example.com' },
    ).fetch(new Request('https://voucha.ai/about'))

    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toContain('public, max-age=')
  })

  it.each([
    [302, { location: '/login' }, '/login'],
    [404, { 'content-type': 'application/json' }, null],
  ])('preserves a non-cacheable %s response', async (status, headers, expectedLocation) => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response(null, { status, headers })),
    ) as unknown as typeof fetch

    const response = await buildOrigin(
      { audience: 'anon', isRsc: false },
      { WEB_ORIGIN: 'https://web.example.com' },
    ).fetch(new Request('https://voucha.ai/about'))

    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('location')).toBe(expectedLocation)
  })

  it.each([
    ['/app.js', 'application/javascript', { WEB_ORIGIN: 'https://web.example.com' }],
    ['/api/v1/posts', 'application/json', { BACKEND_ORIGIN: 'https://backend.example.com' }],
  ])('caches an allowed non-HTML response for %s', async (path, contentType, env) => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('body', { headers: { 'content-type': contentType } })),
    ) as unknown as typeof fetch

    const response = await buildOrigin({ audience: 'anon', isRsc: false }, env).fetch(
      new Request(new URL(path, 'https://voucha.ai')),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('public, max-age=')
  })
})
