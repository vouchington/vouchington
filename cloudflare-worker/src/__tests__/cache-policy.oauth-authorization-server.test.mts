import { describe, expect, it } from 'vitest'
import { getCachePolicy, parseStaticCachedPaths } from '../cache-policy.mts'
import { finalizeOriginResponse } from '../cache-writeback.mts'
import { isOAuthConsentRoute, isPrivateBackendCacheBypassRoute } from '../cache-route-policy.mts'

const baseInput = {
  staticCachedPaths: parseStaticCachedPaths('/favicon.ico,/robots.txt'),
  sitemapCacheTtlSeconds: 86_400,
  staticCacheTtlSeconds: 86_400,
  botCacheTtlSeconds: 86_400,
  anonCacheTtlSeconds: 30,
  rssCacheTtlSeconds: 300,
  hasReferralAttributionSignal: false,
  hasFeatureFlagOverrideCookie: false,
  hasUnverifiedSessionCookies: false,
}

describe('OAuth authorization-server cache policy', () => {
  it('forces no-store bypass for exact backend protocol routes', () => {
    for (const pathname of ['/authorize', '/register', '/revoke', '/token']) {
      expect(isPrivateBackendCacheBypassRoute(pathname)).toBe(true)
      expect(
        getCachePolicy({ ...baseInput, pathname, botTier: null, isAuthenticated: false }),
      ).toMatchObject({ mode: 'bypass', forceNoStore: true })
    }
  })

  it('forces no-store bypass for consent APIs without matching lookalike prefixes', () => {
    const pathname = '/api/v1/oauth/authorization-requests/00000000-0000-7000-8000-000000000001'
    expect(isPrivateBackendCacheBypassRoute(pathname)).toBe(true)
    expect(isPrivateBackendCacheBypassRoute(`${pathname}/decisions`)).toBe(true)
    expect(isPrivateBackendCacheBypassRoute('/api/v1/oauthish/authorization-requests/id')).toBe(
      false,
    )
    const policy = getCachePolicy({
      ...baseInput,
      pathname,
      botTier: 'known',
      isAuthenticated: false,
    })
    expect(policy).toMatchObject({ mode: 'bypass', forceNoStore: true })
    const response = finalizeOriginResponse({
      edgeSession: { kind: 'anon-passthrough' },
      fetchDuration: 1,
      forceNoStore: policy.forceNoStore,
      isProduction: false,
      originResponse: new Response('Unauthorized', {
        status: 401,
        headers: { 'cache-control': 'public, max-age=300' },
      }),
    })
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
  })

  it('forces no-store on the personalized consent page for every audience', () => {
    expect(isOAuthConsentRoute('/oauth/consent')).toBe(true)
    expect(isOAuthConsentRoute('/oauth/consent/')).toBe(true)
    expect(isOAuthConsentRoute('/oauth/consent/help')).toBe(false)
    for (const botTier of [null, 'known'] as const) {
      const policy = getCachePolicy({
        ...baseInput,
        pathname: '/oauth/consent',
        botTier,
        isAuthenticated: false,
      })
      expect(policy).toMatchObject({ mode: 'bypass', forceNoStore: true })
      const response = finalizeOriginResponse({
        edgeSession: { kind: 'anon-passthrough' },
        fetchDuration: 1,
        forceNoStore: policy.forceNoStore,
        isProduction: false,
        originResponse: new Response('consent', {
          headers: { 'cache-control': 'public, max-age=300' },
        }),
      })
      expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    }
  })
})
