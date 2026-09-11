import { describe, expect, it } from 'vitest'
import { getCachePolicy, parseStaticCachedPaths } from '../cache-policy.mts'
import { hasReferralAttributionSignal } from '../cache-route-policy.mts'

describe('hasReferralAttributionSignal', () => {
  it('matches a `?referrer=` query param on any path', () => {
    expect(hasReferralAttributionSignal(new URL('https://example.com/blog?referrer=alice'))).toBe(
      true,
    )
  })

  it('matches an `/@`-prefixed landing-page path', () => {
    expect(hasReferralAttributionSignal(new URL('https://example.com/@alice'))).toBe(true)
    expect(hasReferralAttributionSignal(new URL('https://example.com/@alice/reviews'))).toBe(true)
  })

  it('does not match unrelated paths or query params', () => {
    expect(hasReferralAttributionSignal(new URL('https://example.com/blog'))).toBe(false)
    expect(hasReferralAttributionSignal(new URL('https://example.com/user/alice'))).toBe(false)
    expect(hasReferralAttributionSignal(new URL('https://example.com/blog?utm_source=x'))).toBe(
      false,
    )
  })
})

describe('referral attribution cache policy', () => {
  const baseInput = {
    staticCachedPaths: parseStaticCachedPaths('/favicon.ico,/robots.txt'),
    sitemapCacheTtlSeconds: 86_400,
    staticCacheTtlSeconds: 86_400,
    botCacheTtlSeconds: 86_400,
    anonCacheTtlSeconds: 30,
    rssCacheTtlSeconds: 300,
  }

  it('bypasses cache when a referral attribution signal is present, before anonymous or bot caching', () => {
    expect(
      getCachePolicy({
        ...baseInput,
        pathname: '/@alice',
        botTier: null,
        isAuthenticated: false,
        hasReferralAttributionSignal: true,
        hasFeatureFlagOverrideCookie: false,
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
        hasReferralAttributionSignal: true,
        hasFeatureFlagOverrideCookie: false,
        hasUnverifiedSessionCookies: false,
      }).mode,
    ).toBe('bypass')
  })

  it('does not bypass cache when no referral attribution signal is present', () => {
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
