import {
  PRIVATE_DISCOVERY_EXACT_PATHS,
  PRIVATE_DISCOVERY_PREFIXES,
  PRIVATE_DYNAMIC_ROUTE_PATTERNS,
  PRIVATE_TOPIC_MANAGEMENT_RE,
} from './patterns.mts'

/**
 * Returns `true` when the given pathname should be excluded from all public discovery
 * surfaces (HTTP `Link` headers, `/llms.txt`, `/.well-known/api-catalog`).
 *
 * Matching is case-insensitive. Any query string or hash fragment is stripped before
 * classification so callers that pass a raw URL path do not bypass the check.
 */
export function isPrivateDiscoveryPath(pathname: string): boolean {
  const lowerPathname = (pathname.split(/[?#]/)[0] ?? '').toLowerCase()
  if (PRIVATE_DISCOVERY_EXACT_PATHS.has(lowerPathname)) {
    return true
  }
  return (
    PRIVATE_DISCOVERY_PREFIXES.some(prefix => lowerPathname.startsWith(prefix)) ||
    PRIVATE_TOPIC_MANAGEMENT_RE.test(lowerPathname) ||
    PRIVATE_DYNAMIC_ROUTE_PATTERNS.some(pattern => pattern.test(lowerPathname))
  )
}
