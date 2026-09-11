import type { ensureSession } from './auth/session-mint.mts'
import { withEdgeSessionCookies } from './auth/session-cookies.mts'
import { INTERNAL_CACHE_VARY_HEADER } from './cache-vary.mts'
import { NO_STORE_HEADERS, withFailureNoStoreHeaders } from './error-response.mts'
import { withHeaders } from './proxy.mts'

type CacheWritebackOptions = {
  edgeSession: Awaited<ReturnType<typeof ensureSession>>
  fetchDuration: number
  forceNoStore: boolean
  isProduction: boolean
  originResponse: Response
}

/**
 * Response shaping for the bypass branch (request-handler.mts's Branch B):
 * requests that never reach CachedOrigin, either because the route/audience
 * is never cacheable (admin, login/auth-callback, authenticated, mutating
 * methods) or because dispatch was gated off (see canDispatchToCache). This
 * never writes to any cache — caching is entirely CachedOrigin's
 * responsibility now (see cached-origin.mts); Workers Cache replaces the old
 * caches.default write-back this module used to perform here. No longer
 * takes cachePolicy/method: those only fed the old no-vary-search response
 * header (see cache-no-vary-search.mts's doc comment for why that mechanism
 * doesn't apply to Workers Cache).
 */
export function finalizeOriginResponse({
  edgeSession,
  fetchDuration,
  forceNoStore,
  isProduction,
  originResponse,
}: CacheWritebackOptions): Response {
  const sanitizedHeaders = new Headers()
  originResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() !== INTERNAL_CACHE_VARY_HEADER.toLowerCase()) {
      sanitizedHeaders.append(key, value)
    }
  })
  const sanitizedResponse = new Response(originResponse.body, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers: sanitizedHeaders,
  })
  const responseForClient = forceNoStore
    ? withHeaders(sanitizedResponse, NO_STORE_HEADERS)
    : withFailureNoStoreHeaders(sanitizedResponse)
  const headers = {
    'x-voucha-cache': 'BYPASS',
    'server-timing': `origin;dur=${fetchDuration}`,
  }
  return withEdgeSessionCookies(withHeaders(responseForClient, headers), edgeSession, isProduction)
}
