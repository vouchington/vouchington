const FETCH_METADATA_HEADERS = ['sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'] as const
const SAFE_NAVIGATION_METHODS = new Set(['GET', 'HEAD'])
// Browsers send this Origin on same-origin requests made under a no-referrer policy.
const NO_REFERRER_ORIGIN = 'null'

export type WebBrowserRequest = {
  method: string
  requestOrigin: string
}

export function hasBrowserFetchMetadata(headers: Headers): boolean {
  return FETCH_METADATA_HEADERS.some(name => headers.has(name))
}

/**
 * Browser evidence that a request came from the web app on this origin, or from a user's
 * top-level navigation such as an OAuth callback. Forgeable by non-browser callers, so it only
 * classifies telemetry; public provenance comes from credentials.
 */
export function isWebBrowserRequest(headers: Headers, request: WebBrowserRequest): boolean {
  if (isTopLevelNavigation(headers, request.method)) return true
  if (headers.get('sec-fetch-site')?.toLowerCase() !== 'same-origin') return false

  const origin = headers.get('origin')
  const referer = headers.get('referer')
  return (
    (origin === null ||
      origin === NO_REFERRER_ORIGIN ||
      parseOrigin(origin) === request.requestOrigin) &&
    (referer === null || parseOrigin(referer) === request.requestOrigin)
  )
}

function isTopLevelNavigation(headers: Headers, method: string): boolean {
  return (
    SAFE_NAVIGATION_METHODS.has(method.toUpperCase()) &&
    headers.get('sec-fetch-mode')?.toLowerCase() === 'navigate' &&
    headers.get('sec-fetch-dest')?.toLowerCase() === 'document'
  )
}

function parseOrigin(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}
