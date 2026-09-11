import { describe, expect, it } from 'vitest'
import { getCachePolicy, parseStaticCachedPaths } from '../cache-policy.mts'
import { isLoginRoute } from '../cache-route-policy.mts'

describe('isLoginRoute', () => {
  it('matches the login page with or without trailing slash', () => {
    expect(isLoginRoute('/login')).toBe(true)
    expect(isLoginRoute('/login/')).toBe(true)
  })

  it('does not match login-adjacent routes', () => {
    expect(isLoginRoute('/login/help')).toBe(false)
    expect(isLoginRoute('/auth/login')).toBe(false)
  })
})

describe('login cache policy', () => {
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

  it('bypasses cache for the login page before anonymous or bot caching', () => {
    for (const pathname of ['/login', '/login/']) {
      expect(
        getCachePolicy({
          ...baseInput,
          pathname,
          botTier: null,
          isAuthenticated: false,
        }),
      ).toMatchObject({
        mode: 'bypass',
        audience: null,
        ttlSeconds: 0,
        fullyCachedRoute: false,
      })

      expect(
        getCachePolicy({
          ...baseInput,
          pathname,
          botTier: 'known',
          isAuthenticated: false,
        }),
      ).toMatchObject({
        mode: 'bypass',
        audience: null,
        ttlSeconds: 0,
        fullyCachedRoute: false,
      })

      expect(
        getCachePolicy({
          ...baseInput,
          pathname,
          botTier: null,
          isAuthenticated: true,
        }).mode,
      ).toBe('bypass')
    }
  })
})
