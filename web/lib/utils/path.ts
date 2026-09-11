/**
 * Segment-aware path matching utilities for navigation active states.
 *
 * Use these instead of raw pathname.startsWith / pathname.includes to avoid
 * false positives where /blog matches /blog-post/123, or 'reviews' matches
 * /referral-program-reviews.
 */

/**
 * Returns true if pathname is exactly href, or is a sub-path of href
 * (i.e. pathname starts with href followed by a '/' segment boundary).
 *
 * Examples:
 *   isActivePath('/blog', '/blog')        → true
 *   isActivePath('/blog/123', '/blog')    → true
 *   isActivePath('/blog-post/1', '/blog') → false  (no segment boundary)
 *   isActivePath('/', '/')               → true
 *   isActivePath('/foo', '/')            → false
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Returns true if the last path segment of pathname equals segment.
 *
 * Examples:
 *   isActiveSegment('/topic/123/reviews', 'reviews') → true
 *   isActiveSegment('/referral-program-reviews', 'reviews') → false
 */
export function isActiveSegment(pathname: string, segment: string): boolean {
  return pathname.endsWith(`/${segment}`)
}

/**
 * Matches a valid `/@username` landing-page path, optionally followed by one sub-path segment.
 * Username rules: starts with a letter, 3-50 chars, ends with a letter or digit, allows `_-` in between.
 *
 * Captures the username in group 1.
 */
export const LANDING_PAGE_HANDLE_RE = /^\/@([A-Za-z][A-Za-z0-9_-]{1,48}[A-Za-z0-9])(?:\/[^/]+)?\/?$/
