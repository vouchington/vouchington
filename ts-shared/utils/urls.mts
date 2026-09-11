import {
  extractUrlHostname,
  extractUrlScheme,
  getFirstPathSegment,
  isExternalHttpUrl,
  matchesHostnamePattern,
  matchesPathnamePattern,
  normalizeHostname,
  sanitizeImageUrl,
  sanitizeLinkUrl,
} from '@vouchington/utils/urls'

export {
  isExternalHttpUrl,
  matchesHostnamePattern as matchDomain,
  matchesPathnamePattern,
  normalizeHostname,
  sanitizeImageUrl,
  sanitizeLinkUrl,
}

export const extractScheme = extractUrlScheme

export const isHostname = (hostname: string): boolean =>
  !!hostname && /^[a-z0-9.-]+$/.test(hostname)

/**
 * Extracts the domain (hostname) from a URL string.
 * Returns 'unknown' if the URL is invalid.
 */
export const extractDomain = (url: string): string => extractUrlHostname(url) ?? 'unknown'

/**
 * Returns the first-level directory (top-level grouping) of a URL pathname.
 * Examples:
 *   /blog/2024/my-post -> /blog
 *   /about -> /
 *   / -> null
 */
export const computeParentPath = getFirstPathSegment
