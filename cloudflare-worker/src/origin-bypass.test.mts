import { describe, expect, it } from 'vitest'
import type { CachePolicy } from './cache-policy.mts'
import { runOriginBypass } from './origin-bypass.mts'
import type { Env } from './types.mts'

const BYPASS_CACHE_POLICY: CachePolicy = {
  mode: 'bypass',
  audience: null,
  forceNoStore: false,
  ttlSeconds: 0,
  staleWhileRevalidateSeconds: 0,
  fullyCachedRoute: false,
  stripCookieNames: new Set(),
  stripAllCookies: false,
}

describe('runOriginBypass', () => {
  it('returns 404 for a sitemap-shaped path with no origin path override, before any origin fetch', async () => {
    // '/sitemap/foo' matches isSitemapRoute (startsWith('/sitemap/')) but no
    // getSitemapOriginPath pattern (those all require the plural '/sitemaps/' prefix), so
    // pathOverride resolves to undefined. POST keeps this off the cache-dispatch path in
    // fetchInner (sitemaps are otherwise always fullyCachedRoute), reaching Branch B.
    const request = new Request('https://example.com/sitemap/foo', { method: 'POST' })
    const response = await runOriginBypass({
      botTier: null,
      cachePolicy: BYPASS_CACHE_POLICY,
      canonicalSitemapUrl: null,
      countryCode: null,
      cspNonce: 'test-nonce',
      edgeSession: { kind: 'anon-passthrough' },
      env: {} as Env,
      forceStripAllCookies: false,
      ip: null,
      isEffectivelyFullyCachedRoute: false,
      isProduction: false,
      request,
      requestId: 'test-request-id',
      target: 'sitemaps',
      url: new URL(request.url),
      webCsp: '',
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ message: 'Not Found', code: 'NOT_FOUND' })
  })
})
