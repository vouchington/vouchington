import { expect } from 'vitest'
import { getCachePolicy, parseStaticCachedPaths } from '../../src/cache-policy.mts'

const bypassPolicy = {
  mode: 'bypass',
  audience: null,
  ttlSeconds: 0,
  fullyCachedRoute: false,
} as const

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
} satisfies Omit<Parameters<typeof getCachePolicy>[0], 'pathname' | 'botTier' | 'isAuthenticated'>

/** Shared auth-callback and login cache bypass cases. Call from the owning `it`. */
export function expectCachePolicyBypassesBeforeAnonymousOrBotCaching(
  pathnames: readonly string[],
): void {
  for (const pathname of pathnames) {
    expect(
      getCachePolicy({
        ...baseInput,
        pathname,
        botTier: null,
        isAuthenticated: false,
      }),
    ).toMatchObject(bypassPolicy)

    expect(
      getCachePolicy({
        ...baseInput,
        pathname,
        botTier: 'known',
        isAuthenticated: false,
      }),
    ).toMatchObject(bypassPolicy)

    expect(
      getCachePolicy({
        ...baseInput,
        pathname,
        botTier: null,
        isAuthenticated: true,
      }).mode,
    ).toBe('bypass')
  }
}
