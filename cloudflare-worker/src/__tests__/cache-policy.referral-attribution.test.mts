import { describe, expect, it } from 'vitest'
import { registerCachePolicyBypassSignalTests } from '../../test-helpers/src/cache-policy-bypass-signal-tests.mts'
import { getCachePolicy } from '../cache-policy.mts'
import { hasReferralAttributionSignal } from '../cache-route-policy.mts'

describe('hasReferralAttributionSignal', () => {
  it('matches a non-empty `referrer` query param on any path', () => {
    expect(hasReferralAttributionSignal(new URL('https://example.com/blog?referrer=alice'))).toBe(
      true,
    )
  })

  it('ignores an empty `?referrer=` query param', () => {
    expect(hasReferralAttributionSignal(new URL('https://example.com/blog?referrer='))).toBe(false)
  })

  it('does not treat a handle landing page as an explicit referral signal', () => {
    expect(hasReferralAttributionSignal(new URL('https://example.com/@alice'))).toBe(false)
    expect(hasReferralAttributionSignal(new URL('https://example.com/@alice/reviews'))).toBe(false)
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
  const getAnonymousHandlePolicy = (url: URL) =>
    getCachePolicy({
      pathname: url.pathname,
      botTier: null,
      isAuthenticated: false,
      staticCachedPaths: new Set(),
      sitemapCacheTtlSeconds: 86_400,
      staticCacheTtlSeconds: 86_400,
      botCacheTtlSeconds: 86_400,
      anonCacheTtlSeconds: 30,
      rssCacheTtlSeconds: 300,
      hasReferralAttributionSignal: hasReferralAttributionSignal(url),
      hasFeatureFlagOverrideCookie: false,
      hasUnverifiedSessionCookies: false,
    })

  it('caches an anonymous handle landing page', () => {
    expect(getAnonymousHandlePolicy(new URL('https://example.com/@alice'))).toMatchObject({
      mode: 'cache',
      audience: 'anon',
      ttlSeconds: 30,
    })
  })

  it('bypasses cache when a referral query signal is present', () => {
    expect(
      getAnonymousHandlePolicy(new URL('https://example.com/@alice?referrer=bob')),
    ).toMatchObject({ mode: 'bypass', audience: null })
  })

  registerCachePolicyBypassSignalTests({
    bypassTitle:
      'bypasses cache when a referral attribution signal is present, before anonymous or bot caching',
    firstBypass: {
      pathname: '/blog',
      botTier: null,
      hasReferralAttributionSignal: true,
      hasFeatureFlagOverrideCookie: false,
    },
    secondBypass: {
      pathname: '/blog',
      botTier: 'known',
      hasReferralAttributionSignal: true,
      hasFeatureFlagOverrideCookie: false,
    },
  })
})
