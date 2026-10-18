import { deriveCacheTags, type CacheTagRouteContext } from '@ts-shared/cache/cache-tags'
import { isValidCacheTag } from '@vouchington/utils/cache-tags'
import {
  edgeErrorResponse,
  finalizeCachedOriginResponse as finalizeEdgeCachedOriginResponse,
} from '@vouchington/edge'
import { getCacheTtlSecondsForAudience, type CacheAudience } from './cache-policy.mts'
import {
  INTERNAL_CACHE_VARY_HEADER,
  VOUCHA_SAFE_SHARED_CACHE_VARY_TOKENS,
} from './cache-headers.mts'
import { getWorkerRequestConfig } from './request-config.mts'
import { RSS_ROUTE_RE, type RouteTarget } from './routing.mts'
import type { Env } from './types.mts'
import { isInvalidWebDocumentResponse } from './web-document-response.mts'

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
  const workerConfig = getWorkerRequestConfig(input.env)
  const ttlSeconds = getCacheTtlSecondsForAudience(input.audience, input.pathname, workerConfig)
  const tagContext: CacheTagRouteContext = {
    isSitemap: input.target === 'sitemaps',
    isRss: RSS_ROUTE_RE.test(input.pathname),
    isStatic: workerConfig.staticCachedPaths.has(input.pathname),
  }
  const tags = input.cacheTagOverride
    ? [input.cacheTagOverride]
    : deriveCacheTags(input.pathname, tagContext)
  return finalizeEdgeCachedOriginResponse(originResponse, {
    ttlSeconds,
    tags,
    internalVaryHeader: INTERNAL_CACHE_VARY_HEADER,
    safeVaryTokens: VOUCHA_SAFE_SHARED_CACHE_VARY_TOKENS,
    isValidOriginTag: input.cacheTagOverride ? undefined : isValidCacheTag,
  })
}
