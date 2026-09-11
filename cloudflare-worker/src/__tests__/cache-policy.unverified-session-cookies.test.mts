import { describe, expect, it } from 'vitest'
import { getCachePolicy, parseStaticCachedPaths } from '../cache-policy.mts'

describe('unverified session cookies cache policy', () => {
  const baseInput = {
    staticCachedPaths: parseStaticCachedPaths('/favicon.ico,/robots.txt'),
    sitemapCacheTtlSeconds: 86_400,
    staticCacheTtlSeconds: 86_400,
    botCacheTtlSeconds: 86_400,
    anonCacheTtlSeconds: 30,
    rssCacheTtlSeconds: 300,
    hasReferralAttributionSignal: false,
    hasFeatureFlagOverrideCookie: false,
  }

  it('bypasses cache when dt/st cookies are present but failed edge verification', () => {
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/blog',
        botTier: null,
        isAuthenticated: false,
        hasUnverifiedSessionCookies: true,
      }),
    ).toMatchObject({
      mode: 'bypass',
      audience: null,
      stripAllCookies: false,
    })
  })

  it('does not bypass cache when no session cookies are present at all', () => {
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/blog',
        botTier: null,
        isAuthenticated: false,
        hasUnverifiedSessionCookies: false,
      }).mode,
    ).toBe('cache')
  })

  it('bot audience takes precedence over unverified session cookies', () => {
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/blog',
        botTier: 'known',
        isAuthenticated: false,
        hasUnverifiedSessionCookies: true,
      }).audience,
    ).toBe('bot')
  })

  it('fully-cached routes take precedence over unverified session cookies', () => {
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/sitemap.xml',
        botTier: null,
        isAuthenticated: false,
        hasUnverifiedSessionCookies: true,
      }).audience,
    ).toBe('static')
  })
})
