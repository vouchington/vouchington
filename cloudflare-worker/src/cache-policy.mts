import { isSitemapRoute, isAdminBackendRoute, RSS_ROUTE_RE } from './routing.mts'
import type { BotTier } from './bot-tier.mts'
import { bypassPolicy, cachedPolicy, type CachePolicy as EdgeCachePolicy } from '@vouchington/edge'
import {
  isAuthCallbackRoute,
  isFullyCachedRoute,
  isLoginRoute,
  isOAuthConsentRoute,
  isPrivateBackendCacheBypassRoute,
} from './cache-route-policy.mts'

const SESSION_COOKIES_TO_STRIP = new Set(['st', 'dt'])

interface CachePolicyInput {
  pathname: string
  botTier: BotTier | null
  isAuthenticated: boolean
  hasReferralAttributionSignal: boolean
  hasFeatureFlagOverrideCookie: boolean
  /** True when `st` claims a real user (uid non-null, unverified) but fails edge verification —
   * see auth/jwt.mts's isAuthShapedSessionToken. Anon `st` (uid: null) is common and excluded. */
  hasUnverifiedSessionCookies: boolean
  staticCachedPaths: Set<string>
  sitemapCacheTtlSeconds: number
  staticCacheTtlSeconds: number
  botCacheTtlSeconds: number
  anonCacheTtlSeconds: number
  rssCacheTtlSeconds: number
}

export type CacheAudience = 'static' | 'bot' | 'anon'

export type CachePolicy = EdgeCachePolicy<CacheAudience> & {
  /** Voucha routes can require no-store behavior while still bypassing shared cache. */
  fullyCachedRoute: boolean
}

const BYPASS_POLICY: CachePolicy = { ...bypassPolicy<CacheAudience>(), fullyCachedRoute: false }

const NO_STORE_BYPASS_POLICY: CachePolicy = {
  ...bypassPolicy<CacheAudience>({ forceNoStore: true }),
  fullyCachedRoute: false,
}
const BOT_NO_STORE_BYPASS_POLICY: CachePolicy = {
  ...bypassPolicy<CacheAudience>({
    forceNoStore: true,
    stripCookieNames: SESSION_COOKIES_TO_STRIP,
  }),
  fullyCachedRoute: false,
}

export type CacheTtlConfig = Pick<
  CachePolicyInput,
  | 'sitemapCacheTtlSeconds'
  | 'staticCacheTtlSeconds'
  | 'botCacheTtlSeconds'
  | 'anonCacheTtlSeconds'
  | 'rssCacheTtlSeconds'
>

// Shared by getCachePolicy (gateway) and CachedOrigin (which only receives the
// `audience` dimension via ctx.props, not the full CachePolicyInput) so both
// compute the same TTL for the same audience/pathname pair.
export const getCacheTtlSecondsForAudience = (
  audience: CacheAudience,
  pathname: string,
  config: CacheTtlConfig,
): number => {
  if (audience === 'static') {
    return isSitemapRoute(pathname)
      ? config.sitemapCacheTtlSeconds
      : RSS_ROUTE_RE.test(pathname)
        ? config.rssCacheTtlSeconds
        : config.staticCacheTtlSeconds
  }
  return audience === 'bot' ? config.botCacheTtlSeconds : config.anonCacheTtlSeconds
}

export const getCachePolicy = (input: CachePolicyInput): CachePolicy => {
  // Admin routes must never be cached regardless of auth state — bypass unconditionally
  // to prevent cross-user leakage if JWT verification is temporarily unavailable.
  if (isAdminBackendRoute(input.pathname)) {
    return BYPASS_POLICY
  }

  if (isPrivateBackendCacheBypassRoute(input.pathname) || isOAuthConsentRoute(input.pathname)) {
    return input.botTier === null ? NO_STORE_BYPASS_POLICY : BOT_NO_STORE_BYPASS_POLICY
  }

  if (
    isLoginRoute(input.pathname) ||
    isAuthCallbackRoute(input.pathname) ||
    input.hasReferralAttributionSignal ||
    input.hasFeatureFlagOverrideCookie
  ) {
    return BYPASS_POLICY
  }

  const fullyCachedRoute = isFullyCachedRoute(input.pathname, input.staticCachedPaths)
  if (fullyCachedRoute) {
    const ttlSeconds = getCacheTtlSecondsForAudience('static', input.pathname, input)
    return { ...cachedPolicy('static', ttlSeconds, { stripAllCookies: true }), fullyCachedRoute }
  }

  // Check bots before auth: bots always get cached responses, cookies stripped, regardless of st.
  if (input.botTier !== null) {
    return {
      ...cachedPolicy('bot', input.botCacheTtlSeconds, {
        stripCookieNames: SESSION_COOKIES_TO_STRIP,
        stripAllCookies: true,
      }),
      fullyCachedRoute: false,
    }
  }

  if (input.isAuthenticated || input.hasUnverifiedSessionCookies) {
    return BYPASS_POLICY
  }

  return {
    ...cachedPolicy('anon', input.anonCacheTtlSeconds, { stripAllCookies: true }),
    fullyCachedRoute: false,
  }
}
