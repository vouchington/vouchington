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
const POST_ANCESTORS_ROUTE_RE = /^\/api\/v1\/posts\/[^/]+\/ancestors\/?$/

export const canUseCache = (request: Request, cacheMode: 'cache' | 'bypass'): boolean =>
  cacheMode === 'cache' && request.method === 'GET'

export const isPrivateBackendCacheBypassRoute = (pathname: string): boolean => {
  const normalizedPathname = pathname.toLowerCase()
  return (
    isOAuthAuthorizationServerRoute(pathname) ||
    PRIVATE_BACKEND_CACHE_BYPASS_PREFIXES.some(
      prefix => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`),
    ) ||
    POST_ANCESTORS_ROUTE_RE.test(normalizedPathname)
  )
}

// RSC-fetch signal: `_rsc` param, `Accept: text/x-component`, or Next's `rsc: '1'` header (see
// proxy.mts's CVE comment) — a header-only miss dispatches full HTML instead of an RSC payload.
export const isRscRequest = (request: Request, url: URL): boolean =>
  url.searchParams.has('_rsc') ||
  (request.headers.get('accept') ?? '').toLowerCase().includes('text/x-component') ||
  request.headers.get('rsc') === '1'

export const isFullyCachedRoute = (pathname: string, staticCachedPaths: Set<string>): boolean =>
  isSitemapRoute(pathname) || RSS_ROUTE_RE.test(pathname) || staticCachedPaths.has(pathname)

export const isLoginRoute = (pathname: string): boolean =>
  pathname === '/login' || pathname === '/login/'

// OAuth popup-relay pages must never be cached: a stale cached page would replay a previous
// provider's callback params (code/state) to the client relay script, minting a stale session.
export const isAuthCallbackRoute = (pathname: string): boolean =>
  pathname === '/auth/callback' || pathname.startsWith('/auth/callback/')

export const isOAuthConsentRoute = (pathname: string): boolean =>
  pathname === '/oauth/consent' || pathname === '/oauth/consent/'

// Referral attribution needs origin to run (cookies stripped + HIT skips origin on cacheable
// audiences); `/@` is a loose superset of web's LANDING_PAGE_HANDLE_RE, so a false positive costs one extra origin hit.
export const hasReferralAttributionSignal = (url: URL): boolean =>
  url.searchParams.has('referrer') || url.pathname.startsWith('/@')
