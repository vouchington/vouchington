import { isSitemapRoute, isAdminBackendRoute, RSS_ROUTE_RE } from './routing.mts'
import { WELL_KNOWN_PATHS } from './specification-documents.mts'
import type { BotTier } from './bot-tier.mts'
import {
  isAuthCallbackRoute,
  isFullyCachedRoute,
  isLoginRoute,
  isOAuthConsentRoute,
  isPrivateBackendCacheBypassRoute,
} from './cache-route-policy.mts'

export const toPositiveNumber = (raw: string | undefined, fallback: number): number => {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.floor(value)
}

// Workers Cache is the sole cache layer (no downstream shared cache), so max-age carries the TTL
// directly. Bound stale origin-error serving to one day instead of Cloudflare's indefinite default.
export const buildCacheControlHeader = (ttlSeconds: number): string =>
  `public, max-age=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 2}, stale-if-error=86400`

const hasSharedCacheDisqualifyingCacheControl = (headers: Headers): boolean => {
  const cacheControl = headers.get('cache-control')
  if (!cacheControl) return false
  return cacheControl
    .split(',')
    .map(part => part.trim().toLowerCase())
    .some(
      directive => directive === 'private' || directive === 'no-store' || directive === 'no-cache',
    )
}

export const isCacheableResponse = (response: Response): boolean => {
  if (response.status < 200 || response.status >= 300) return false
  if (hasSharedCacheDisqualifyingCacheControl(response.headers)) return false
  return !response.headers.has('set-cookie')
}

const SESSION_COOKIES_TO_STRIP = new Set(['st', 'dt'])
const EMPTY_SET = new Set<string>()

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

export interface CachePolicy {
  mode: 'cache' | 'bypass'
  /** Which audience this response targets. Determines the cache key suffix. */
  audience: CacheAudience | null
  /** True for routes that must not remain browser/intermediary cacheable on BYPASS. */
  forceNoStore: boolean
  ttlSeconds: number
  staleWhileRevalidateSeconds: number
  fullyCachedRoute: boolean
  stripCookieNames: Set<string>
  stripAllCookies: boolean
}

const BYPASS_POLICY: CachePolicy = {
  mode: 'bypass',
  audience: null,
  forceNoStore: false,
  ttlSeconds: 0,
  staleWhileRevalidateSeconds: 0,
  fullyCachedRoute: false,
  stripCookieNames: EMPTY_SET,
  stripAllCookies: false,
}

const NO_STORE_BYPASS_POLICY: CachePolicy = { ...BYPASS_POLICY, forceNoStore: true }
const BOT_NO_STORE_BYPASS_POLICY: CachePolicy = {
  ...NO_STORE_BYPASS_POLICY,
  stripCookieNames: SESSION_COOKIES_TO_STRIP,
}

export const parseStaticCachedPaths = (raw: string | undefined): Set<string> => {
  const extra = raw
    ? raw.split(',').flatMap(pathname => (pathname.trim() ? [pathname.trim()] : []))
    : []
  // Always include the hardcoded defaults so a CACHED_STATIC_PATHS binding adds paths rather than dropping them.
  return new Set([
    '/favicon.ico',
    '/robots.txt',
    '/llms.txt',
    '/llms-full.txt',
    ...WELL_KNOWN_PATHS,
    ...extra,
  ])
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
    return {
      mode: 'cache',
      audience: 'static',
      forceNoStore: false,
      ttlSeconds,
      staleWhileRevalidateSeconds: ttlSeconds * 2,
      fullyCachedRoute,
      stripCookieNames: EMPTY_SET,
      stripAllCookies: true,
    }
  }

  // Check bots before auth: bots always get cached responses, cookies stripped, regardless of st.
  if (input.botTier !== null) {
    return {
      mode: 'cache',
      audience: 'bot',
      forceNoStore: false,
      ttlSeconds: input.botCacheTtlSeconds,
      staleWhileRevalidateSeconds: input.botCacheTtlSeconds * 2,
      fullyCachedRoute: false,
      stripCookieNames: SESSION_COOKIES_TO_STRIP,
      stripAllCookies: true,
    }
  }

  if (input.isAuthenticated || input.hasUnverifiedSessionCookies) {
    return BYPASS_POLICY
  }

  return {
    mode: 'cache',
    audience: 'anon',
    forceNoStore: false,
    ttlSeconds: input.anonCacheTtlSeconds,
    staleWhileRevalidateSeconds: input.anonCacheTtlSeconds * 2,
    fullyCachedRoute: false,
    stripCookieNames: EMPTY_SET,
    stripAllCookies: true,
  }
}
