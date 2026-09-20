import { edgeErrorResponse } from './error-response.mts'
import { getMarkdownAliasOriginPath } from './markdown-aliases.mts'
import { getOAuthBrokerCallbackOriginPath } from './oauth-broker-callback-routing.mts'
import { isOAuthAuthorizationServerRoute } from './oauth-authorization-server-routing.mts'
import { SITEMAP_FAMILY_TYPES, SITEMAP_POST_TYPES } from '@voucha/config/sitemap-types'
import type { Env } from './types.mts'

type RouteTarget = 'backend' | 'web' | 'sitemaps'
export type { RouteTarget }
export type ResolveOriginResult = { origin: string } | { error: Response }

const ORIGIN_ENV_KEYS: Record<
  RouteTarget,
  keyof Pick<Env, 'SITEMAPS_ORIGIN' | 'BACKEND_ORIGIN' | 'WEB_ORIGIN'>
> = {
  sitemaps: 'SITEMAPS_ORIGIN',
  backend: 'BACKEND_ORIGIN',
  web: 'WEB_ORIGIN',
}

const ORIGIN_ERROR_MESSAGES: Record<RouteTarget, string> = {
  sitemaps: 'Sitemaps origin not configured',
  backend: 'Backend not configured',
  web: 'Web origin not configured',
}

const ENCODED_SITEMAP_PATH_TRAVERSAL_RE = /%(?:2e|2f|5c)/i
const SITEMAP_POST_TYPE_SET: ReadonlySet<string> = new Set(SITEMAP_POST_TYPES)
const SITEMAP_FAMILY_SET: ReadonlySet<string> = new Set(SITEMAP_FAMILY_TYPES)
const SITEMAP_TYPE_SEGMENT = '([A-Za-z0-9_-]+)'
const TYPE_INDEX_SITEMAP_PATH_RE = new RegExp(`^/sitemaps/${SITEMAP_TYPE_SEGMENT}\\.xml$`)
const FAMILY_PAGE_SITEMAP_PATH_RE = new RegExp(
  `^/sitemaps/${SITEMAP_TYPE_SEGMENT}/([1-9]\\d*)\\.xml$`,
)
const DAY_INDEX_SITEMAP_PATH_RE = new RegExp(
  `^/sitemaps/${SITEMAP_TYPE_SEGMENT}/(\\d{4})-(\\d{2})-(\\d{2})/index\\.xml$`,
)
const DAY_PAGE_SITEMAP_PATH_RE = new RegExp(
  `^/sitemaps/${SITEMAP_TYPE_SEGMENT}/(\\d{4})-(\\d{2})-(\\d{2})/([1-9]\\d*)\\.xml$`,
)
export const API_ROUTE_RE = /^\/api(?:\/|$)/i
export const INFRA_ROUTE_RE = /^\/infra(?:\/|$)/i
export const MD_ROUTE_RE = /^\/md(?:\/|$)/i
export const RSS_ROUTE_RE = /^\/rss(?:\/|$)/i
// WELL_KNOWN_ROUTE_RE is intentionally broad — it forwards every /.well-known/* path to backend
// (webfinger/nodeinfo), but worker-owned static documents (security.txt, api-catalog, etc.) are
// matched exactly and served inline in inline-responses.mts before getRouteTarget ever runs.
export const WELL_KNOWN_ROUTE_RE = /^\/\.well-known(?:\/|$)/i
export const AP_ROUTE_RE = /^\/ap(?:\/|$)/i
export const NODEINFO_ROUTE_RE = /^\/nodeinfo(?:\/|$)/i
// Bluesky AT-Protocol OAuth client metadata document (Phase D1), served at a bare root path (not
// under /.well-known/) per the AT-Protocol OAuth spec — backend/api/bluesky/client-metadata.mts.
export const CLIENT_METADATA_ROUTE_RE = /^\/client-metadata\.json$/i
export { isOAuthAuthorizationServerRoute } from './oauth-authorization-server-routing.mts'

export const resolveOrigin = (target: RouteTarget, env: Env): ResolveOriginResult => {
  const origin = env[ORIGIN_ENV_KEYS[target]]
  if (!origin) {
    return { error: edgeErrorResponse(502, ORIGIN_ERROR_MESSAGES[target], 'BAD_GATEWAY') }
  }
  return { origin }
}

export const isSitemapRoute = (pathname: string): boolean =>
  pathname === '/sitemap.xml' ||
  pathname.startsWith('/sitemaps/') ||
  pathname.startsWith('/sitemap/')

// Must match DASHBOARD_PREFIX in backend/entrypoints/api/serve.mts
export const isAdminBackendRoute = (pathname: string): boolean =>
  pathname === '/admin/mq-dashboard' || pathname.startsWith('/admin/mq-dashboard/')

export const getRouteTarget = (pathname: string): RouteTarget => {
  if (isSitemapRoute(pathname)) {
    return 'sitemaps'
  }

  if (getMarkdownAliasOriginPath(pathname) || getOAuthBrokerCallbackOriginPath(pathname)) {
    return 'backend'
  }

  if (API_ROUTE_RE.test(pathname) || INFRA_ROUTE_RE.test(pathname)) {
    return 'backend'
  }

  if (MD_ROUTE_RE.test(pathname) || RSS_ROUTE_RE.test(pathname)) {
    return 'backend'
  }

  if (
    WELL_KNOWN_ROUTE_RE.test(pathname) ||
    AP_ROUTE_RE.test(pathname) ||
    NODEINFO_ROUTE_RE.test(pathname)
  ) {
    return 'backend'
  }

  if (isAdminBackendRoute(pathname)) {
    return 'backend'
  }

  if (CLIENT_METADATA_ROUTE_RE.test(pathname)) {
    return 'backend'
  }

  if (isOAuthAuthorizationServerRoute(pathname)) {
    return 'backend'
  }

  return 'web'
}

export const getCanonicalSitemapUrl = (url: URL): URL | null => {
  if (!isSitemapRoute(url.pathname) || !url.search) {
    return null
  }

  const canonicalUrl = new URL(url)
  canonicalUrl.search = ''
  return canonicalUrl
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const isValidSitemapDate = (year: string, month: string, day: string): boolean => {
  const numericYear = Number(year)
  const numericMonth = Number(month)
  const numericDay = Number(day)
  if (numericMonth < 1 || numericMonth > 12) return false
  const maxDay =
    numericMonth === 2 && isLeapYear(numericYear) ? 29 : DAYS_IN_MONTH[numericMonth - 1]
  return numericDay >= 1 && numericDay <= maxDay
}

export const getSitemapOriginPath = (pathname: string): string | null => {
  if (ENCODED_SITEMAP_PATH_TRAVERSAL_RE.test(pathname)) {
    return null
  }

  if (pathname === '/sitemap.xml') {
    return '/sitemaps/root.xml'
  }

  if (
    pathname === '/sitemaps/posts.xml' ||
    pathname === '/sitemaps/root.xml' ||
    pathname === '/sitemaps/static.xml'
  ) {
    return pathname
  }

  const typeIndexMatch = pathname.match(TYPE_INDEX_SITEMAP_PATH_RE)
  if (typeIndexMatch) {
    const [, segment] = typeIndexMatch
    if (SITEMAP_POST_TYPE_SET.has(segment)) {
      return `/sitemaps/types/${segment}.xml`
    }
    if (SITEMAP_FAMILY_SET.has(segment)) {
      return `/sitemaps/families/${segment}.xml`
    }
    return null
  }

  const familyPageMatch = pathname.match(FAMILY_PAGE_SITEMAP_PATH_RE)
  if (familyPageMatch) {
    const [, family, page] = familyPageMatch
    if (SITEMAP_FAMILY_SET.has(family)) {
      return `/families/${family}/${page}.xml`
    }
    return null
  }

  const dayIndexMatch = pathname.match(DAY_INDEX_SITEMAP_PATH_RE)
  if (dayIndexMatch) {
    const [, postType, year, month, day] = dayIndexMatch
    if (!SITEMAP_POST_TYPE_SET.has(postType)) return null
    if (!isValidSitemapDate(year, month, day)) return null
    return `/posts/${year}/${month}/${day}/${postType}/index.xml`
  }

  const dayPageMatch = pathname.match(DAY_PAGE_SITEMAP_PATH_RE)
  if (dayPageMatch) {
    const [, postType, year, month, day, page] = dayPageMatch
    if (!SITEMAP_POST_TYPE_SET.has(postType)) return null
    if (!isValidSitemapDate(year, month, day)) return null
    return `/posts/${year}/${month}/${day}/${postType}/${page}.xml`
  }

  return null
}

export const getOriginPathOverride = (pathname: string): string | null =>
  getOAuthBrokerCallbackOriginPath(pathname) ??
  (isSitemapRoute(pathname) ? getSitemapOriginPath(pathname) : getMarkdownAliasOriginPath(pathname))
