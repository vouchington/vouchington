export function isValidUrl(url: string) {
  return getValidUrlHref(url) !== null
}

export function getValidUrlHref(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.href
  } catch {
    return null
  }
}

/**
 * Mirrors the backend `isHttpUrlWithoutFragment` rule used for free-form
 * landing-page links: http(s) only, a non-empty host, and no fragment. Keeping
 * the client gate and draft-item validation on this single helper prevents the
 * "Add item" button from enabling for URLs the server will reject on save.
 */
export function isHttpUrlWithoutFragment(url: string): boolean {
  try {
    const { protocol, hostname, hash } = new URL(url.trim())
    return (protocol === 'http:' || protocol === 'https:') && hostname !== '' && hash === ''
  } catch {
    return false
  }
}
