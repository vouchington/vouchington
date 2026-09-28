import { isRemovedSideloadRoute } from '@ts-shared/url-signing'
import { edgeErrorResponse } from './error-response.mts'
import { getMarkdownAliasOriginPath } from './markdown-aliases.mts'
import { getOAuthBrokerCallbackOriginPath } from './oauth-broker-callback-routing.mts'
import { isOAuthAuthorizationServerRoute } from './oauth-authorization-server-routing.mts'
import { getSitemapOriginPath, isSitemapRoute } from './sitemap-routing.mts'
import type { Env } from './types.mts'

export { getCanonicalSitemapUrl, getSitemapOriginPath, isSitemapRoute } from './sitemap-routing.mts'

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

export function rejectRemovedSideloadRoute(pathname: string): Response | undefined {
  if (!isRemovedSideloadRoute(pathname)) return undefined
  return edgeErrorResponse(404, 'Removed sideload route', 'REMOVED_MEDIA_ROUTE')
}

export const getOriginPathOverride = (pathname: string): string | null =>
  getOAuthBrokerCallbackOriginPath(pathname) ??
  (isSitemapRoute(pathname) ? getSitemapOriginPath(pathname) : getMarkdownAliasOriginPath(pathname))
