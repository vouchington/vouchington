import { describe, expect, it } from 'vitest'
import { registerCachePolicyBypassSignalTests } from '../../test-helpers/src/cache-policy-bypass-signal-tests.mts'
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
  registerCachePolicyBypassSignalTests({
    bypassTitle:
      'bypasses cache when a referral attribution signal is present, before anonymous or bot caching',
    negativeTitle: 'does not bypass cache when no referral attribution signal is present',
    firstBypass: {
      pathname: '/@alice',
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
