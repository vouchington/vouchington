const FETCH_METADATA_HEADERS = ['sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'] as const
const SAME_SITE_FETCH_SITES = new Set(['same-origin', 'same-site'])
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SAFE_NAVIGATION_METHODS = new Set(['GET', 'HEAD'])

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
  const method = request.method.toUpperCase()
  if (isTopLevelNavigation(headers, method)) return true

  const fetchSite = headers.get('sec-fetch-site')?.toLowerCase()
  if (!fetchSite || !SAME_SITE_FETCH_SITES.has(fetchSite)) return false

  const origin = headers.get('origin')
  if (origin === null) {
    if (MUTATING_METHODS.has(method)) return false
  } else if (parseOrigin(origin) !== request.requestOrigin) {
    return false
  }

  const referer = headers.get('referer')
  return referer === null || parseOrigin(referer) === request.requestOrigin
}

function isTopLevelNavigation(headers: Headers, method: string): boolean {
  return (
    SAFE_NAVIGATION_METHODS.has(method) &&
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
