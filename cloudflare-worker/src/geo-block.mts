/**
 * Parses a comma-separated list of ISO 3166-1 Alpha-2 country codes from an env var.
 * Returns a Set of uppercase codes, or null if the value is empty/unset (disables blocking).
 */
export function parseBlockedCountries(envValue: string | undefined): Set<string> | null {
  if (!envValue || envValue.trim() === '') {
    return null
  }
  const codes = envValue
    .split(',')
    .flatMap(code => (code.trim() ? [code.trim().toUpperCase()] : []))
  return codes.length > 0 ? new Set(codes) : null
}

/**
 * Returns true if the request should be geo-blocked.
 *
 * Uses `cf-ray` as an edge-presence signal: if it is set the request transited
 * Cloudflare's edge, so a missing `cf-ipcountry` is anomalous and we fail closed.
 * When `cf-ray` is absent (local dev / CI) we allow regardless of `cf-ipcountry`.
 */
export function isGeoBlocked(headers: Headers, blockedCountries: Set<string> | null): boolean {
  if (!blockedCountries) return false
  if (!headers.get('cf-ray')) return false
  const country = headers.get('cf-ipcountry')
  if (!country) return true
  return blockedCountries.has(country.toUpperCase())
}
