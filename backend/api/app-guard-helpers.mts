/**
 * Request-path normalization for the listener-level origin guard. The guard matches the raw
 * request target against its exempt-path allowlist, so keep normalization in this one place.
 */

export function getRequestPath(url: string): string {
  const rawPath = absoluteRequestTargetPath(url) ?? url.split('?')[0]
  // Collapse every run of consecutive slashes (not just leading/trailing) so the guards match
  // exempt paths the same way the router normalizes them — no `//`-based mismatches.
  const routePath = rawPath.replace(/\/+/g, '/') || '/'
  return routePath.replace(/\/+$/, '') || '/'
}

function absoluteRequestTargetPath(url: string): string | null {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null
  try {
    return new URL(url).pathname
  } catch {
    return '/'
  }
}
