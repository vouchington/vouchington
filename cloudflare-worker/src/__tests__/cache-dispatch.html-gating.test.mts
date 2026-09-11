import { describe, expect, it, vi } from 'vitest'
import { dispatchToCachedOrigin, type CacheDispatchInput } from '../cache-dispatch.mts'
import type { EdgeExecutionContext, Env } from '../types.mts'

const unusedPurge = () => Promise.reject(new Error('purge unexpectedly called in this test'))

const buildContext = (
  fetchImpl: (request: Request) => Promise<Response>,
): EdgeExecutionContext => ({
  waitUntil: () => {},
  exports: {
    CachedOrigin: {
      fetch: vi.fn<VitestLooseMock>((request: Request) => fetchImpl(request)),
      purge: unusedPurge,
    },
  },
})

const baseInput = (
  overrides: Partial<CacheDispatchInput> = {},
): CacheDispatchInput & { context: EdgeExecutionContext } => ({
  audience: 'anon',
  botTier: null,
  context: buildContext(() => Promise.resolve(new Response('ok'))),
  cspNonce: 'real-per-request-nonce',
  dispatchUrl: new URL('https://voucha.ai/api/v1/posts'),
  edgeSession: { kind: 'anon-passthrough' },
  env: {} as Env,
  ip: null,
  isProduction: false,
  isRsc: false,
  method: 'GET',
  requestId: 'test-request-id',
  target: 'backend',
  ...overrides,
})

describe('dispatchToCachedOrigin HTML content-type gating', () => {
  it('rewrites the placeholder nonce for mixed-case exact HTML media types', async () => {
    const placeholder = 'placeholder-secret-at-least-32-chars'
    const context = buildContext(() =>
      Promise.resolve(
        new Response(`<script nonce="${placeholder}"></script>`, {
          headers: { 'content-type': 'Text/HTML; Charset=UTF-8' },
        }),
      ),
    )

    const response = await dispatchToCachedOrigin(
      baseInput({
        context,
        dispatchUrl: new URL('https://voucha.ai/about'),
        target: 'web',
        cspNonce: 'fresh-real-nonce',
        env: { CACHE_PLACEHOLDER_NONCE: placeholder } as Env,
      }),
    )

    const body = await response.text()
    expect(body).toContain('nonce="fresh-real-nonce"')
    expect(body).not.toContain(placeholder)
  })

  it.each([
    ['missing', undefined],
    ['invalid', 'text/htmlx'],
    ['non-HTML', 'application/json'],
  ])(
    'fails closed for a successful extensionless web response with %s content type',
    async (_label, contentType) => {
      const headers = contentType ? { 'content-type': contentType } : undefined
      const context = buildContext(() =>
        Promise.resolve(new Response('<script nonce="placeholder-secret"></script>', { headers })),
      )

      const response = await dispatchToCachedOrigin(
        baseInput({
          context,
          dispatchUrl: new URL('https://voucha.ai/about'),
          target: 'web',
          env: { CACHE_PLACEHOLDER_NONCE: 'placeholder-secret' } as Env,
        }),
      )

      expect(response.status).toBe(502)
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(await response.text()).toBe(
        JSON.stringify({ message: 'Bad Gateway', code: 'BAD_GATEWAY' }),
      )
    },
  )

  it('preserves redirects without an HTML content type', async () => {
    const context = buildContext(() =>
      Promise.resolve(new Response(null, { status: 302, headers: { location: '/login' } })),
    )

    const response = await dispatchToCachedOrigin(
      baseInput({
        context,
        dispatchUrl: new URL('https://voucha.ai/about'),
        target: 'web',
      }),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/login')
  })

  it.each([
    '/opengraph-image',
    '/landing/alice/example/opengraph-image-a1b2c3',
    '/landing/alice/twitter-image',
  ])('preserves a successful extensionless Next.js image response for %s', async path => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const context = buildContext(() =>
      Promise.resolve(new Response(imageBytes, { headers: { 'content-type': 'image/png' } })),
    )

    const response = await dispatchToCachedOrigin(
      baseInput({
        context,
        dispatchUrl: new URL(path, 'https://voucha.ai'),
        target: 'web',
      }),
    )

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(imageBytes)
  })

  it.each([204, 205])('preserves an intentionally empty %s web response', async status => {
    const context = buildContext(() => Promise.resolve(new Response(null, { status })))

    const response = await dispatchToCachedOrigin(
      baseInput({
        context,
        dispatchUrl: new URL('https://voucha.ai/about'),
        target: 'web',
      }),
    )

    expect(response.status).toBe(status)
    expect(await response.text()).toBe('')
  })

  it('does not rewrite the placeholder nonce for a non-HTML target === "web" response (e.g. a binary static asset)', async () => {
    const bodyWithPlaceholder = '<script nonce="placeholder-secret"></script>'
    const context = buildContext(() =>
      Promise.resolve(
        new Response(bodyWithPlaceholder, { headers: { 'content-type': 'image/x-icon' } }),
      ),
    )

    const response = await dispatchToCachedOrigin(
      baseInput({
        context,
        dispatchUrl: new URL('https://voucha.ai/favicon.ico'),
        target: 'web',
        cspNonce: 'fresh-real-nonce',
        env: { CACHE_PLACEHOLDER_NONCE: 'placeholder-secret' } as Env,
      }),
    )

    expect(await response.text()).toBe(bodyWithPlaceholder)
  })

  it('overrides client-facing Cache-Control to no-store for an HTML dispatch, regardless of target', async () => {
    const context = buildContext(() =>
      Promise.resolve(new Response('<html></html>', { headers: { 'content-type': 'text/html' } })),
    )

    const response = await dispatchToCachedOrigin(baseInput({ context, target: 'backend' }))

    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
  })

  it('leaves Cache-Control untouched for a non-HTML dispatch', async () => {
    const context = buildContext(() =>
      Promise.resolve(new Response('icon-bytes', { headers: { 'content-type': 'image/x-icon' } })),
    )

    const response = await dispatchToCachedOrigin(
      baseInput({
        context,
        dispatchUrl: new URL('https://voucha.ai/favicon.ico'),
        target: 'web',
      }),
    )

    expect(response.headers.get('cache-control')).toBeNull()
  })
})
