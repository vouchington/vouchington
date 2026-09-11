import { describe, expect, it } from 'vitest'
import { getCachePolicy, parseStaticCachedPaths } from '../cache-policy.mts'

describe('feature-flag override cookie cache policy', () => {
  const baseInput = {
    staticCachedPaths: parseStaticCachedPaths('/favicon.ico,/robots.txt'),
    sitemapCacheTtlSeconds: 86_400,
    staticCacheTtlSeconds: 86_400,
    botCacheTtlSeconds: 86_400,
    anonCacheTtlSeconds: 30,
    rssCacheTtlSeconds: 300,
  }

  it('bypasses cache when a feature-flag override cookie is present, before anonymous or bot caching', () => {
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/blog',
        botTier: null,
        isAuthenticated: false,
        hasReferralAttributionSignal: false,
        hasFeatureFlagOverrideCookie: true,
        hasUnverifiedSessionCookies: false,
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
        pathname: '/blog',
        botTier: 'known',
        isAuthenticated: false,
        hasReferralAttributionSignal: false,
        hasFeatureFlagOverrideCookie: true,
        hasUnverifiedSessionCookies: false,
      }).mode,
    ).toBe('bypass')
  })

  it('does not bypass cache when no feature-flag override cookie is present', () => {
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/blog',
        botTier: null,
        isAuthenticated: false,
        hasReferralAttributionSignal: false,
        hasFeatureFlagOverrideCookie: false,
        hasUnverifiedSessionCookies: false,
      }).mode,
    ).toBe('cache')
  })
})
