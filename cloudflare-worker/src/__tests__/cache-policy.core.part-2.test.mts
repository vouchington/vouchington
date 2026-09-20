import { describe, expect, it } from 'vitest'

import { getCachePolicy, parseStaticCachedPaths } from '../cache-policy.mts'

describe('cache-policy', () => {
  const staticCachedPaths = parseStaticCachedPaths('/favicon.ico,/robots.txt')

  it('caches bot requests to API paths', () => {
    const result = getCachePolicy({
      pathname: '/api/v1/posts',
      botTier: 'unknown',
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('cache')
    expect(result.ttlSeconds).toBe(86_400)
    expect(result.stripAllCookies).toBe(true)
  })

  it('caches anonymous requests to API paths', () => {
    const result = getCachePolicy({
      pathname: '/api/v1/posts',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('cache')
    expect(result.ttlSeconds).toBe(30)
    expect(result.stripAllCookies).toBe(true)
  })

  it.each([
    '/api/v1/my',
    '/api/v1/my/profile',
    '/api/v1/me/individual',
    '/api/v1/feeds/posts/follow_users',
    '/api/v1/bookmarks/post/abc/save',
    '/api/v1/auth/me',
    '/api/v1/auth/sessions',
    '/api/v1/session',
    '/api/v1/copyright-notices/00000000-0000-7000-8000-000000000001/participant',
    '/api/v1/copyright-email-intakes/00000000-0000-7000-8000-000000000001/raw',
    '/api/v1/posts/comment-abc/ancestors',
  ])('bypasses private backend route %s before cache dispatch', pathname => {
    const result = getCachePolicy({
      pathname,
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('bypass')
    expect(result.audience).toBeNull()
    expect(result.forceNoStore).toBe(true)
  })

  it('bypasses private backend routes before bot cache policy', () => {
    const result = getCachePolicy({
      pathname: '/api/v1/auth/sessions',
      botTier: 'known',
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('bypass')
    expect(result.audience).toBeNull()
    expect(result.forceNoStore).toBe(true)
    expect(result.stripCookieNames.has('st')).toBe(true)
    expect(result.stripCookieNames.has('dt')).toBe(true)
  })

  it('bypasses cache for admin routes regardless of auth state', () => {
    const baseInput = {
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    }

    // Unauthenticated (would normally get anon cache)
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/admin/mq-dashboard',
        botTier: null,
        isAuthenticated: false,
      }).mode,
    ).toBe('bypass')

    // Authenticated
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/admin/mq-dashboard',
        botTier: null,
        isAuthenticated: true,
      }).mode,
    ).toBe('bypass')

    // Bot (would normally get bot cache)
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/admin/mq-dashboard',
        botTier: 'known',
        isAuthenticated: false,
      }).mode,
    ).toBe('bypass')

    // Admin subpath
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/admin/mq-dashboard/queues',
        botTier: null,
        isAuthenticated: false,
      }).mode,
    ).toBe('bypass')
  })

  it('uses rssCacheTtlSeconds for RSS routes', () => {
    const result = getCachePolicy({
      pathname: '/rss',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('cache')
    expect(result.ttlSeconds).toBe(300)
    expect(result.fullyCachedRoute).toBe(true)
    expect(result.stripAllCookies).toBe(true)
  })

  it('uses rssCacheTtlSeconds for RSS subpaths', () => {
    const result = getCachePolicy({
      pathname: '/rss/posts',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(result.mode).toBe('cache')
    expect(result.ttlSeconds).toBe(300)
    expect(result.fullyCachedRoute).toBe(true)
    expect(result.stripAllCookies).toBe(true)
  })

  it('distinguishes between RSS and static cache TTLs', () => {
    const rssResult = getCachePolicy({
      pathname: '/rss/news',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 3_600,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 600,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    const staticResult = getCachePolicy({
      pathname: '/favicon.ico',
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths,
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 3_600,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 600,
      hasReferralAttributionSignal: false,
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

    expect(rssResult.ttlSeconds).toBe(600)
    expect(staticResult.ttlSeconds).toBe(3_600)
  })
})
