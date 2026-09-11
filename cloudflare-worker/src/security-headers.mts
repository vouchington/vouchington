import { getOAuthBrokerCallbackOriginPath } from './oauth-broker-callback-routing.mts'
import { withHeaders } from './proxy.mts'
import { RSS_ROUTE_RE } from './routing.mts'

const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'attribution-reporting=()',
  'bluetooth=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'gamepad=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'idle-detection=()',
  'interest-cohort=()',
  'join-ad-interest-group=()',
  'local-fonts=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'run-ad-auction=()',
  'screen-wake-lock=()',
  'serial=()',
  'speaker-selection=()',
  'sync-xhr=()',
  'usb=()',
  'web-share=()',
  'xr-spatial-tracking=()',
].join(', ')

// The CF Worker edge is authoritative for all response headers below. The
// backend also emits X-Frame-Options and X-XSS-Protection as defence-in-depth,
// but the edge always overwrites them — if the two ever diverge, the edge wins.
const BASE_SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'x-xss-protection': '0',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': PERMISSIONS_POLICY,
  // Request origin-keyed agent clusters so same-site subdomains cannot use
  // document.domain to relax into a shared JavaScript agent cluster.
  'origin-agent-cluster': '?1',
  // Ordinary pages isolate unrelated documents while preserving popups that opt
  // out of COOP. OAuth callback documents use the route-specific override below.
  'cross-origin-opener-policy': 'same-origin-allow-popups',
  // CORP same-origin makes all responses opaque to cross-origin fetch/XHR reads,
  // including from same-site-but-cross-origin URLs. This is intentional for all
  // current routes. If a future endpoint needs to be loadable from cross-origin
  // contexts (e.g. a public API with CORS headers), that endpoint's origin response
  // must set `cross-origin-resource-policy: cross-origin` or `same-site`, which
  // the edge will overwrite. A per-route escape hatch in the Worker will be
  // required before adding cross-origin API endpoints (see #4367).
  'cross-origin-resource-policy': 'same-origin',
}

// Content-Security-Policy is applied per-route: web routes receive a strict CSP built
// by buildWebCsp() in csp.mts. Backend routes are excluded — they serve API responses,
// not HTML pages.
// The caller passes the CSP string via the optional `csp` parameter below.
//
// WARNING: includeSubDomains takes effect in browsers immediately upon receiving
// this header, breaking any subdomain served over HTTP. Verify no HTTP subdomains
// exist before deploying to production.
//
// preload additionally requests inclusion in browser HSTS preload lists and is
// effectively irreversible on a short timeline. It is gated behind the separate
// HSTS_PRELOAD env var (set to 'true') to require an explicit opt-in separate
// from the general PRODUCTION flag. See production checklist in SECURITY.md.
const buildHsts = (includePreload: boolean): string =>
  `max-age=63072000; includeSubDomains${includePreload ? '; preload' : ''}`

// The apikey query param and OAuth callback code/state are bearer-like URL credentials. Origin
// handlers set Referrer-Policy: no-referrer on these exact routes so credentials never leak through
// a subsequent Referer header. Route-scoped so this never becomes a general trust of arbitrary
// origin Referrer-Policy values — see the value check in addSecurityHeaders below.
export const isKeyedRssReferrerRequest = (url: URL): boolean =>
  RSS_ROUTE_RE.test(url.pathname) && !!url.searchParams.get('apikey')

export const shouldPreserveOriginNoReferrer = (url: URL): boolean =>
  isKeyedRssReferrerRequest(url) || getOAuthBrokerCallbackOriginPath(url.pathname) !== null

export const addSecurityHeaders = (
  response: Response,
  isProduction = false,
  hstsPreload = false,
  csp?: string,
  openerPolicy: 'same-origin-allow-popups' | 'unsafe-none' = 'same-origin-allow-popups',
  preserveOriginNoReferrer = false,
): Response => {
  const headers: Record<string, string> = isProduction
    ? { ...BASE_SECURITY_HEADERS, 'strict-transport-security': buildHsts(hstsPreload) }
    : { ...BASE_SECURITY_HEADERS }
  if (csp) {
    headers['content-security-policy'] = csp
  }
  headers['cross-origin-opener-policy'] = openerPolicy
  // Headers.get() comma-joins repeated headers (e.g. from a proxy in front of the origin, or a
  // future middleware change) — split defensively rather than trust the origin to send exactly one
  // value. Matching any comma-separated token can only make this MORE restrictive (no-referrer),
  // never less, so this can't be abused to leak a URL credential.
  if (
    preserveOriginNoReferrer &&
    response.headers
      .get('referrer-policy')
      ?.split(',')
      .some(value => value.trim().toLowerCase() === 'no-referrer')
  ) {
    headers['referrer-policy'] = 'no-referrer'
  }
  return withHeaders(response, headers)
}
