import { signPathWithKey, verifyPathWithKey } from './hmac.mts'

export const SIDELOAD_SIGNING_KEYS_ENV = 'VOUCHA_SIDELOAD_SIGNING_KEYS'

/**
 * Build a sideload proxy URL for an external image.
 *
 * Returns `null` when the URL is empty, malformed, relative, already a sideload path, or not http(s).
 * Mirrors the Rust `should_proxy_image` + `rewrite_image_to_sideload` logic.
 */
export function buildSideloadImageUrl(
  externalUrl: string,
  opts: { imageOrigin: string; width: number; signingKeys: string[]; quality?: number },
): string | null {
  const url = externalUrl.trim()
  if (!url) return null
  if (url.startsWith('//')) return null
  if (url.startsWith('/sideload/')) return null
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null
  } catch {
    return null
  }
  const imageOrigin = new URL(opts.imageOrigin).origin
  if (isAbsoluteSideloadUrl(url, imageOrigin)) return null

  const encoded = Buffer.from(url, 'utf8').toString('base64url')
  const path = `/sideload/${encoded}`
  let sig: string | null = null
  try {
    sig = signPath(path, opts.signingKeys)
  } catch {
    sig = null
  }
  let query = `w=${opts.width}`
  if (opts.quality !== undefined) query += `&q=${opts.quality}`
  if (sig) query += `&sig=${sig}`
  return `${imageOrigin}${path}?${query}`
}

function isAbsoluteSideloadUrl(value: string, imageOrigin: string): boolean {
  try {
    const candidate = new URL(value)
    return (
      candidate.origin === imageOrigin &&
      (candidate.pathname === '/sideload' || candidate.pathname.startsWith('/sideload/'))
    )
  } catch {
    return false
  }
}

/**
 * Parse a comma-separated list of hex-encoded HMAC keys from an env var value.
 * Keys are trimmed and empty entries are skipped.
 */
export function parseSigningKeys(envValue: string | undefined): string[] {
  if (!envValue) return []
  return envValue.split(',').flatMap(k => {
    const key = k.trim()
    if (!key || key.toUpperCase() === 'PLACEHOLDER') return []
    return [key]
  })
}

/**
 * Sign a path using the first key that successfully signs.
 * Returns hex HMAC-SHA256 of the path.
 * Returns '' if no keys are configured (dev mode) or no key is usable.
 */
export function signPath(path: string, keys: string[]): string {
  for (const key of keys) {
    try {
      return signPathWithKey(path, key)
    } catch {
      // key is invalid (bad hex/length) — try next
    }
  }
  return ''
}

/**
 * Verify a path signature against all keys (for key rotation).
 * Returns true if any key produces a matching HMAC.
 * Returns true if no keys are configured (dev mode).
 */
export function verifyPathSignature(path: string, signature: string, keys: string[]): boolean {
  if (keys.length === 0) return true
  return keys.some(key => verifyPathWithKey(path, signature, key))
}
