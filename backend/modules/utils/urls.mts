import _validator from 'validator'
import { isPrivateIp } from 'ssrf-guard'
import net from 'node:net'
import createHttpError from 'http-errors'

export const isFQDN = _validator.isFQDN

export const isPublicHostname = (rawHostname: string): boolean => {
  const hostname = rawHostname.replace(/\.+$/, '').replace(/^\[(.+)\]$/, '$1')
  if (hostname === 'localhost' || hostname.endsWith('.local')) return false
  const ipVersion = net.isIP(hostname)
  if (ipVersion !== 0) return !isPrivateIp(hostname)
  if (!isFQDN(hostname)) return false
  return true
}

export const validateHttpUrl = (url: string) =>
  _validator.isURL(url, {
    require_protocol: true,
    require_valid_protocol: true,
    protocols: ['http', 'https'],
    require_host: true,
    allow_fragments: true,
    validate_length: true,
  })

export const validateHttpUrlWithoutFragment = (url: string) =>
  _validator.isURL(url, {
    require_protocol: true,
    require_valid_protocol: true,
    protocols: ['http', 'https'],
    require_host: true,
    allow_fragments: false,
    validate_length: true,
  })

export const isHttpUrlWithoutFragment = (url: string) => {
  try {
    const urlObject = new URL(url)
    return validateHttpUrlWithoutFragment(urlObject.toString())
  } catch {
    return false
  }
}

const MAX_URL_TABLE_URL_LENGTH = 2083
const MAX_URL_TABLE_PATHNAME_LENGTH = 2048
const HTTP_URL_WITH_AUTHORITY_PATTERN = /^https?:\/\/[^/?#]/i

type NormalizeUrlOptions = {
  /**
   * When true, preserve `http:` protocol instead of upgrading to `https:`.
   * Port 80 is still cleared for canonical form.
   * Defaults to false (http → https upgrade).
   */
  preserveHttp?: boolean
}

/**
 * Normalizes a URL string for storage in the urls table.
 * - Upgrades `http:` to `https:` automatically (unless `preserveHttp` is true).
 * - Strips trailing dots from hostnames before storage and hostname policy checks.
 * - Strips fragments because urls.url stores fetchable resources, not document anchors.
 * - Throws a TypeError for malformed URLs (non-parseable by WHATWG URL).
 * - Throws an Error for non-http(s) schemes (javascript:, ftp:, data:, mailto:, …).
 * - Throws an Error for values that violate urls table length checks.
 */
export const normalizeUrlForUrlTable = (href: string, options?: NormalizeUrlOptions): URL => {
  const { preserveHttp = false } = options ?? {}
  const normalizedHref = href.trim()
  let url: URL
  try {
    url = new URL(normalizedHref)
  } catch (error) {
    throw new TypeError(`Invalid URL: ${href}`, { cause: error })
  }
  const canonicalHostname = url.hostname.replace(/\.+$/, '')
  if (canonicalHostname !== url.hostname) {
    url.hostname = canonicalHostname
  }
  if (url.protocol === 'http:') {
    if (preserveHttp) {
      // Keep http: but clear port 80 for canonical form (http://example.com:80/ → http://example.com/)
      if (url.port === '80') {
        url.port = ''
      }
    } else {
      url.protocol = 'https:'
      // Port 80 is HTTP's default — clear it so the upgraded URL is in canonical form
      // (https://example.com:80/ → https://example.com/).
      if (url.port === '80') {
        url.port = ''
      }
    }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw createHttpError(400, 'URL must use http or https')
  }
  if (!HTTP_URL_WITH_AUTHORITY_PATTERN.test(normalizedHref)) {
    throw new TypeError(`Invalid URL: ${href}`, {
      cause: new Error('URL must include an http(s) authority'),
    })
  }
  url.hash = ''
  if (url.toString().length > MAX_URL_TABLE_URL_LENGTH) {
    throw new Error(`URL exceeds ${MAX_URL_TABLE_URL_LENGTH} characters`)
  }
  if (url.pathname.length > MAX_URL_TABLE_PATHNAME_LENGTH) {
    throw new Error(`URL pathname exceeds ${MAX_URL_TABLE_PATHNAME_LENGTH} characters`)
  }
  return url
}

/**
 * Returns true if the URL is a YouTube channel RSS feed
 * (https://www.youtube.com/feeds/videos.xml?channel_id=...).
 */
export function isYouTubeChannelFeedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'youtube.com' && parsed.hostname !== 'www.youtube.com') return false
    return parsed.pathname === '/feeds/videos.xml'
  } catch {
    return false
  }
}
