import { deriveCacheTags, type CacheTagRouteContext } from '@ts-shared/cache/cache-tags'
import {
  buildCacheControlHeader,
  getCacheTtlSecondsForAudience,
  isCacheableResponse,
  type CacheAudience,
} from './cache-policy.mts'
import { stripCacheHeaders } from './cache-response-headers.mts'
import { INTERNAL_CACHE_VARY_HEADER, parseSafeCacheVary } from './cache-vary.mts'
import { edgeErrorResponse } from './error-response.mts'
import { withHeaders } from './proxy.mts'
import { getWorkerRequestConfig } from './request-config.mts'
import { RSS_ROUTE_RE, type RouteTarget } from './routing.mts'
import type { Env } from './types.mts'
import { isInvalidWebDocumentResponse } from './web-document-response.mts'

const NON_CACHEABLE_HEADERS = { 'cache-control': 'private, no-store' } as const

export const finalizeCachedOriginResponse = (
  originResponse: Response,
  input: {
    audience: CacheAudience
    cacheTagOverride?: string
    env: Env
    pathname: string
    target: RouteTarget
  },
): Response => {
  if (isInvalidWebDocumentResponse(originResponse, input.target, input.pathname)) {
    return edgeErrorResponse(502, 'Bad Gateway', 'BAD_GATEWAY')
  }
  if (!isCacheableResponse(originResponse)) {
    return withHeaders(originResponse, NON_CACHEABLE_HEADERS)
  }

  const originVaryTokens = parseSafeCacheVary(originResponse.headers.get('vary'))
  const workerConfig = getWorkerRequestConfig(input.env)
  const ttlSeconds = getCacheTtlSecondsForAudience(input.audience, input.pathname, workerConfig)
  const cacheHeaders = stripCacheHeaders(originResponse.headers)
  cacheHeaders.delete(INTERNAL_CACHE_VARY_HEADER)
  cacheHeaders.delete('set-cookie')
  if (originVaryTokens === null) {
    cacheHeaders.set('cache-control', NON_CACHEABLE_HEADERS['cache-control'])
    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: cacheHeaders,
    })
  }
  cacheHeaders.delete('vary')
  if (originVaryTokens.length > 0) {
    cacheHeaders.set(INTERNAL_CACHE_VARY_HEADER, originVaryTokens.join(', '))
  }
  cacheHeaders.set('cache-control', buildCacheControlHeader(ttlSeconds))
  const tagContext: CacheTagRouteContext = {
    isSitemap: input.target === 'sitemaps',
    isRss: RSS_ROUTE_RE.test(input.pathname),
    isStatic: workerConfig.staticCachedPaths.has(input.pathname),
  }
  const tags = input.cacheTagOverride
    ? [input.cacheTagOverride]
    : deriveCacheTags(input.pathname, tagContext)
  cacheHeaders.set('Cache-Tag', tags.join(','))
  return new Response(originResponse.body, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers: cacheHeaders,
  })
}
