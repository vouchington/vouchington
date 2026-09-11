import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from './constants.mts'
import type { CrawlerHtmlStructuredValue } from './types.mts'

export function isSnapshotReusable(
  htmlSha256: Buffer | null,
  uploadedAt: Date | null,
  now: Date,
): uploadedAt is Date {
  if (!htmlSha256 || !uploadedAt) return false
  return uploadedAt.getTime() >= now.getTime() - CRAWL_HTML_SNAPSHOT_RETENTION_DAYS * 86400000
}

export function safeResolveUrl(raw: string | null | undefined, base: string): string | null {
  if (!raw) return null
  try {
    return new URL(raw, base).toString()
  } catch {
    return null
  }
}

export function safeHostname(urlStr: string): string | null {
  try {
    return new URL(urlStr).hostname
  } catch {
    return null
  }
}

// Product token from our crawler user-agent ("voucha-bot https://...")
const OWN_AGENT_TOKEN = 'voucha-bot'

/**
 * Parse an X-Robots-Tag header value, returning only the global directives.
 * - No agent prefix: kept as-is
 * - "all:" prefix: kept as-is
 * - Our own agent prefix ("voucha-bot:"): prefix is stripped, value kept
 * - Value-argument directives ("unavailable_after:", etc.): kept as-is
 * - All other agent-specific directives (e.g. "googlebot: noindex"): dropped
 */
export function parseXRobotsTag(raw: string): string {
  if (!raw) return ''
  // Known directives that carry a value argument and are NOT agent prefixes
  const VALUE_DIRECTIVES = [
    'unavailable_after',
    'max-snippet',
    'max-image-preview',
    'max-video-preview',
  ]
  return raw
    .split(',')
    .flatMap(segment => {
      const s = segment.trim()
      const colonIdx = s.indexOf(':')
      if (colonIdx === -1) return s ? [s] : [] // global directive, keep as-is
      const prefix = s.slice(0, colonIdx).trim().toLowerCase()
      if (VALUE_DIRECTIVES.includes(prefix)) return [s] // value-directive, keep as-is
      if (prefix === 'all') return [s] // all: prefix, keep as-is
      if (prefix === OWN_AGENT_TOKEN) {
        const stripped = s.slice(colonIdx + 1).trim()
        return stripped ? [stripped] : [] // strip bot prefix
      }
      return [] // discard other agent-specific directives
    })
    .join(', ')
}

export function findFirstStructuredString(
  value: CrawlerHtmlStructuredValue | undefined,
): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const href = findFirstStructuredString(entry)
      if (href) {
        return href
      }
    }

    return null
  }

  for (const entry of Object.values(value)) {
    const href = findFirstStructuredString(entry)
    if (href) {
      return href
    }
  }

  return null
}
