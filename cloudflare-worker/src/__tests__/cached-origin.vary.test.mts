import { afterEach, describe, expect, it, vi } from 'vitest'
import { CachedOrigin } from '../cached-origin.mts'
import type { CachedOriginProps, Env } from '../types.mts'

const buildOrigin = (props: CachedOriginProps, env: Env = {}) =>
  new CachedOrigin({ props, waitUntil: () => {}, passThroughOnException: () => {} }, env)

describe('CachedOrigin Vary handling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tunnels a safe origin Vary header without exposing it to Workers Cache', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('ok', {
          headers: {
            vary: 'cookie, , AUTHORIZATION, Accept-Encoding, accept-language, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url, COOKIE,',
          },
        }),
      ),
    ) as unknown as typeof fetch

    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      { BACKEND_ORIGIN: 'https://backend.example.com' },
    )
    const response = await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))

    expect(response.headers.get('vary')).toBeNull()
    expect(response.headers.get('x-voucha-cache-vary')).toBe(
      'Cookie, Authorization, Accept-Encoding, Accept-Language, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url',
    )
    expect(response.headers.get('cache-control')).toContain('max-age=30')
  })

  it.each(['*', 'Accept-Encoding, X-Unknown-Variant'])(
    'fails closed when origin Vary contains %s',
    async vary => {
      globalThis.fetch = vi.fn<VitestLooseMock>(() =>
        Promise.resolve(
          new Response('ok', {
            headers: { vary, 'x-voucha-cache-vary': 'Cookie' },
          }),
        ),
      ) as unknown as typeof fetch

      const origin = buildOrigin(
        { audience: 'anon', isRsc: false },
        { BACKEND_ORIGIN: 'https://backend.example.com' },
      )
      const response = await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))

      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(response.headers.get('x-voucha-cache-vary')).toBeNull()
    },
  )

  it('removes an origin-supplied internal Vary tunnel header when no Vary is present', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response('ok', { headers: { 'x-voucha-cache-vary': 'Cookie, X-Smuggled' } }),
      ),
    ) as unknown as typeof fetch

    const origin = buildOrigin(
      { audience: 'anon', isRsc: false },
      { BACKEND_ORIGIN: 'https://backend.example.com' },
    )
    const response = await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))

    expect(response.headers.get('x-voucha-cache-vary')).toBeNull()
  })
})
