import { isPublicHostname, normalizeUrlForUrlTable } from '@modules/utils'
// Relocated to @voucha/types (pure config data, no service dependencies) so that
// backend/test-helpers can use this type without creating a
// test-helpers -> services workspace cycle. Re-exported here for call-site stability.
import type { RssFeedUrlValidationResult } from '@voucha/types/entities/rss-feed-url-validation-result'

export type { RssFeedUrlValidationResult }

export function validateRssFeedUrl(url: string): RssFeedUrlValidationResult {
  const trimmed = url.trim()
  if (!trimmed) {
    return { valid: false, error: 'URL is empty' }
  }

  // Parse before scheme normalisation so the fragment check sees the raw
  // input (including stray `#` not yet percent-decoded).
  let raw: URL
  try {
    raw = new URL(trimmed)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  if (raw.hash !== '' || trimmed.includes('#')) {
    return { valid: false, error: 'RSS feed URLs must not contain fragments' }
  }

  if (!isPublicHostname(raw.hostname)) {
    return { valid: false, error: 'Invalid URL format' }
  }

  // Preserve the original protocol (http or https) in canonical form for URL-table storage.
  // Protocol upgrade (http → https) happens later in the source-creation flow after probing.
  let parsed: URL
  try {
    parsed = normalizeUrlForUrlTable(trimmed, { preserveHttp: true })
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  return { valid: true, canonicalUrl: parsed.toString() }
}
