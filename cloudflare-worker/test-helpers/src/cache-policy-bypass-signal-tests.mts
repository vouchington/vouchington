/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { expect, test } from 'vitest'
import type { BotTier } from '../../src/bot-tier.mts'
import { getCachePolicy, parseStaticCachedPaths } from '../../src/cache-policy.mts'

const baseInput = {
  staticCachedPaths: parseStaticCachedPaths('/favicon.ico,/robots.txt'),
  sitemapCacheTtlSeconds: 86_400,
  staticCacheTtlSeconds: 86_400,
  botCacheTtlSeconds: 86_400,
  anonCacheTtlSeconds: 30,
  rssCacheTtlSeconds: 300,
}

type CachePolicyBypassCall = {
  pathname: string
  botTier: BotTier | null
  hasFeatureFlagOverrideCookie: boolean
  hasReferralAttributionSignal: boolean
}

const policyInput = (call: CachePolicyBypassCall) => ({
  ...baseInput,
  pathname: call.pathname,
  botTier: call.botTier,
  isAuthenticated: false,
  hasReferralAttributionSignal: call.hasReferralAttributionSignal,
  hasFeatureFlagOverrideCookie: call.hasFeatureFlagOverrideCookie,
  hasUnverifiedSessionCookies: false,
})

/** Shared bypass and negative cache-policy cases. Call from a literal `describe`. */
export function registerCachePolicyBypassSignalTests(options: {
  bypassTitle: string
  negativeTitle: string
  firstBypass: CachePolicyBypassCall
  secondBypass: CachePolicyBypassCall
}): void {
  const { bypassTitle, negativeTitle, firstBypass, secondBypass } = options

  // oxlint-disable-next-line vitest/valid-title, jest/valid-title -- each suite passes its own literal title
  test(bypassTitle, () => {
    expect(getCachePolicy(policyInput(firstBypass))).toMatchObject({
      mode: 'bypass',
      audience: null,
      ttlSeconds: 0,
      fullyCachedRoute: false,
    })

    expect(getCachePolicy(policyInput(secondBypass)).mode).toBe('bypass')
  })

  // oxlint-disable-next-line vitest/valid-title, jest/valid-title -- each suite passes its own literal title
  test(negativeTitle, () => {
    expect(
      getCachePolicy(
        policyInput({
          pathname: '/blog',
          botTier: null,
          hasFeatureFlagOverrideCookie: false,
          hasReferralAttributionSignal: false,
        }),
      ).mode,
    ).toBe('cache')
  })
}
