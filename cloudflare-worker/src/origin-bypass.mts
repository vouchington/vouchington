import type { ensureSession } from './auth/session-mint.mts'
import type { BotTier } from './bot-tier.mts'
import type { CachePolicy } from './cache-policy.mts'
import { finalizeOriginResponse } from './cache-writeback.mts'
import { edgeErrorResponse } from './error-response.mts'
import { buildWorkerOriginRequest, fetchOriginResponse } from './origin-request.mts'
import { checkBotRateLimit } from './rate-limit.mts'
import { getOriginPathOverride, resolveOrigin, type RouteTarget } from './routing.mts'
import type { Env } from './types.mts'

type OriginBypassInput = {
  botTier: BotTier | null
  cachePolicy: CachePolicy
  canonicalSitemapUrl: URL | null
  countryCode: string | null
  cspNonce: string
  edgeSession: Awaited<ReturnType<typeof ensureSession>>
  env: Env
  /** External server-to-server ingress carries no browser session — any dt/st cookie a caller
   * still attaches must never reach the origin, or a mutating origin route can mistake the request
   * for a browser cross-site submission. See isExternalServerToServerIngress's call site. */
  forceStripAllCookies: boolean
  ip: string | null
  isEffectivelyFullyCachedRoute: boolean
  isProduction: boolean
  request: Request
  requestId: string
  target: RouteTarget
  url: URL
  webCsp: string
}

/**
 * Branch B: bypass — never reaches CachedOrigin, never touches any cache. Extracted from
 * fetchInner (request-handler.mts, which hit the max-lines cap) — this is every step that runs
 * once canDispatchToCache has resolved false there.
 */
export async function runOriginBypass(input: OriginBypassInput): Promise<Response> {
  const {
    botTier,
    cachePolicy,
    canonicalSitemapUrl,
    countryCode,
    cspNonce,
    edgeSession,
    env,
    forceStripAllCookies,
    ip,
    isEffectivelyFullyCachedRoute,
    isProduction,
    request,
    requestId,
    target,
    url,
    webCsp,
  } = input

  // Bot rate limiting for unknown bots applies here directly since Branch B always reaches
  // origin; Branch A's equivalent check runs inside CachedOrigin.fetch() (see
  // cached-origin.mts), gated by botTier/ip relayed as dispatch-only headers, so a real cache
  // HIT never runs it.
  if (botTier === 'unknown') {
    const botAllowed = await checkBotRateLimit({
      env,
      method: request.method,
      pathname: url.pathname,
      ip,
    })
    if (!botAllowed) {
      return edgeErrorResponse(429, 'Too Many Requests', 'RATE_LIMIT', { 'retry-after': '60' })
    }
  }

  // Sitemap-404 is duplicated in cached-origin.mts's own copy of this check (accepted minor
  // duplication: the two entrypoints independently recompute routing from ctx.props/dispatch URL).
  const pathOverride = getOriginPathOverride(url.pathname) ?? undefined
  if (target === 'sitemaps' && !pathOverride) {
    return edgeErrorResponse(404, 'Not Found', 'NOT_FOUND')
  }

  const originResult = resolveOrigin(target, env)
  if ('error' in originResult) return originResult.error
  const { origin } = originResult

  const skipsCookieStripping = cachePolicy.fullyCachedRoute && !isEffectivelyFullyCachedRoute
  const stripCookieNames = skipsCookieStripping ? new Set<string>() : cachePolicy.stripCookieNames
  const originRequest = buildWorkerOriginRequest({
    canonicalSitemapUrl,
    cspNonce,
    edgeSession,
    env,
    origin,
    pathOverride,
    request,
    requestId,
    requestKind: botTier === null ? undefined : 'bot',
    stripCookieNames,
    stripAllCookies: forceStripAllCookies,
    target,
    webCsp,
  })
  const originFetch = await fetchOriginResponse(originRequest, {
    botTier,
    countryCode,
    requestId,
    target,
  })
  if ('error' in originFetch) return originFetch.error
  const { duration: fetchDuration, response: originResponse } = originFetch

  return finalizeOriginResponse({
    edgeSession,
    fetchDuration,
    forceNoStore: cachePolicy.forceNoStore,
    isProduction,
    originResponse,
  })
}
