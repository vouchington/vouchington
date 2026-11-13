import { isOAuthAuthorizationServerRoute, isSitemapRoute, RSS_ROUTE_RE } from './routing.mts'

const PRIVATE_BACKEND_CACHE_BYPASS_PREFIXES = [
  '/api/v1/my',
  '/api/v1/me',
  '/api/v1/feeds',
  '/api/v1/bookmarks',
  '/api/v1/auth',
  '/api/v1/oauth',
  '/api/v1/session',
  '/api/v1/copyright-notices',
  '/api/v1/copyright-email-intakes',
  '/api/v1/copyright-form-intakes',
  '/api/v1/copyright-submissions',
  '/api/v1/copyright-legal-hold-assessments',
  '/api/v1/copyright-media-delivery',
  '/api/v1/recommended-topics',
]
// Ancestors and descendants embed posts other than the path id, so one Cache-Tag cannot purge them.
const POST_EMBEDDED_THREAD_ROUTE_RE = /^\/api\/v1\/posts\/[^/]+\/(?:ancestors|descendants)\/?$/

export const canUseCache = (request: Request, cacheMode: 'cache' | 'bypass'): boolean =>
  cacheMode === 'cache' && request.method === 'GET'

export const isPrivateBackendCacheBypassRoute = (pathname: string): boolean => {
  const normalizedPathname = pathname.toLowerCase()
  return (
    isOAuthAuthorizationServerRoute(pathname) ||
    PRIVATE_BACKEND_CACHE_BYPASS_PREFIXES.some(
      prefix => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`),
    ) ||
    POST_EMBEDDED_THREAD_ROUTE_RE.test(normalizedPathname)
  )
}

// RSC-fetch signal: `_rsc` param, `Accept: text/x-component`, or Next's `rsc: '1'` header (see
// published edge proxy builder's CVE comment) — a header-only miss dispatches full HTML instead of an RSC payload.
export const isRscRequest = (request: Request, url: URL): boolean =>
  url.searchParams.has('_rsc') ||
  (request.headers.get('accept') ?? '').toLowerCase().includes('text/x-component') ||
  request.headers.get('rsc') === '1'

export const isFullyCachedRoute = (pathname: string, staticCachedPaths: Set<string>): boolean =>
  isSitemapRoute(pathname) || RSS_ROUTE_RE.test(pathname) || staticCachedPaths.has(pathname)

export const isSessionEntryRoute = (pathname: string): boolean =>
  ['/login', '/login/', '/session-renewal', '/session-renewal/'].includes(pathname)

// OAuth popup-relay pages must never be cached: a stale cached page would replay a previous
// provider's callback params (code/state) to the client relay script, minting a stale session.
export const isAuthCallbackRoute = (pathname: string): boolean =>
  pathname === '/auth/callback' || pathname.startsWith('/auth/callback/')

export const isOAuthConsentRoute = (pathname: string): boolean =>
  pathname === '/oauth/consent' || pathname === '/oauth/consent/'

// Explicit referral attribution needs origin to run (cookies stripped + HIT skips origin on
// cacheable audiences). Handle landing pages remain cacheable for anonymous visitors.
export const hasReferralAttributionSignal = (url: URL): boolean =>
  Boolean(url.searchParams.get('referrer'))
