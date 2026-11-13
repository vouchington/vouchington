import { afterEach, describe, expect, it, vi } from 'vitest'
import { CachedOrigin } from '../cached-origin.mts'
import type { CachedOriginProps, Env } from '../types.mts'

const buildOrigin = (props: CachedOriginProps, env: Env = {}) =>
  new CachedOrigin({ props, waitUntil: () => {}, passThroughOnException: () => {} }, env)

describe('CachedOrigin cache TTL', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    { audience: 'anon', ttl: '120' },
    { audience: 'bot', ttl: '900' },
  ] as const)(
    'sets the configured $audience cache TTL for a public origin response and strips shared-cache-volatile headers',
    async ({ audience, ttl }) => {
      globalThis.fetch = vi.fn<VitestLooseMock>(() =>
        Promise.resolve(
          new Response('ok', {
            headers: {
              'cache-control': 'public',
              'content-security-policy': "script-src 'nonce-stale'",
            },
          }),
        ),
      ) as unknown as typeof fetch

      const origin = buildOrigin(
        { audience, isRsc: false },
        {
          BACKEND_ORIGIN: 'https://backend.example.com',
          ANON_CACHE_TTL_SECONDS: '120',
          BOT_CACHE_TTL_SECONDS: '900',
        },
      )
      const response = await origin.fetch(new Request('https://voucha.ai/api/v1/posts'))

      expect(response.headers.get('cache-control')).toBe(
        `public, max-age=${ttl}, stale-while-revalidate=${Number(ttl) * 2}, stale-if-error=86400`,
      )
      expect(response.headers.get('content-security-policy')).toBeNull()
      expect(response.headers.get('set-cookie')).toBeNull()
    },
  )
})
