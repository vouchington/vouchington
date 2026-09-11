import { describe, expect, it } from 'vitest'
import { getCachePolicy, parseStaticCachedPaths } from '../cache-policy.mts'
import { isAuthCallbackRoute } from '../cache-route-policy.mts'

describe('isAuthCallbackRoute', () => {
  it('matches the bare callback path and any provider subpath', () => {
    expect(isAuthCallbackRoute('/auth/callback')).toBe(true)
    expect(isAuthCallbackRoute('/auth/callback/github')).toBe(true)
    expect(isAuthCallbackRoute('/auth/callback/github/broker')).toBe(true)
    expect(isAuthCallbackRoute('/auth/callback/google')).toBe(true)
  })

  it('does not match auth-callback-adjacent routes', () => {
    expect(isAuthCallbackRoute('/auth/callback-help')).toBe(false)
    expect(isAuthCallbackRoute('/auth')).toBe(false)
    expect(isAuthCallbackRoute('/auth/login')).toBe(false)
  })
})

describe('auth callback cache policy', () => {
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

  it('bypasses cache for auth callback pages before anonymous or bot caching', () => {
    for (const pathname of [
      '/auth/callback',
      '/auth/callback/github',
      '/auth/callback/github/broker',
    ]) {
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
