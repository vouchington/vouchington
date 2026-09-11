import { WorkerEntrypoint, type CachePurgeResult } from 'cloudflare:workers'
import { finalizeCachedOriginResponse } from './cached-origin-response.mts'
import { DISPATCH_BOT_TIER_HEADER, DISPATCH_IP_HEADER } from './cache-dispatch.mts'
import { buildWebCsp } from './csp.mts'
import { edgeErrorResponse } from './error-response.mts'
import { buildWorkerOriginRequest, fetchOriginResponse } from './origin-request.mts'
import { isProductionMode } from './production-mode.mts'
import { checkBotRateLimit } from './rate-limit.mts'
import { getOriginPathOverride, getRouteTarget, resolveOrigin } from './routing.mts'
import {
  createEdgeCacheCanaryResponse,
  EDGE_CACHE_CANARY_PATH,
  EDGE_CACHE_CANARY_TAG,
} from './staging-canary.mts'
import { INTERNAL_CANARY_FAULT_HEADER } from './staging-control-headers.mts'
import type { CachedOriginProps, Env } from './types.mts'
// Strips the dispatch-only bot-tier/IP signal (see cache-dispatch.mts) before any
// origin-bound request is built — the raw header names must never reach the origin.
// The IP is re-injected as cf-connecting-ip only inside the synthetic dispatch request:
// cache-dispatch.mts builds never carries CF's own cf-connecting-ip, so without this,
// buildOriginRequest's cf-connecting-ip -> x-forwarded-for rewrite would silently drop
// the client IP on every MISS. buildOriginRequest strips cf-connecting-ip before the
// origin fetch. (Reconstructing an `rsc` header from ctx.props.isRsc is deferred —
// RSC stays BYPASS pending plan risk #2 verification.)
const stripDispatchOnlyHeaders = (request: Request): Request => {
  const headers = new Headers(request.headers)
  headers.delete(DISPATCH_BOT_TIER_HEADER)
  headers.delete(INTERNAL_CANARY_FAULT_HEADER)
  const dispatchIp = headers.get(DISPATCH_IP_HEADER)
  headers.delete(DISPATCH_IP_HEADER)
  if (dispatchIp) headers.set('cf-connecting-ip', dispatchIp)
  return new Request(request, { headers })
}

/**
 * Thin origin-fetching passthrough that Workers Cache sits in front of (see
 * the Wrangler `exports.CachedOrigin` entrypoint). The platform caches by
 * (entrypoint, canonical request, ctx.props), so this class only ever runs on
 * a cache MISS — a HIT never reaches this code. It independently recomputes
 * everything the gateway (request-handler.mts) already decided, because
 * `ctx.props` only carries `audience`/`isRsc`: which cache-policy audience
 * this route belongs to and whether it's an RSC fetch are the only two
 * dimensions the platform needs to partition the cache key by.
 *
 * Never mints or forwards session cookies: the gateway only dispatches here
 * for cacheable audiences (static/bot/anon), and getCachePolicy() always sets
 * `stripAllCookies: true` for those — so cookie content is irrelevant and a
 * fixed `{ kind: 'anon-passthrough' }` edge-session sentinel is always
 * correct, exactly like the gateway already does for bot requests.
 */
export class CachedOrigin extends WorkerEntrypoint<Env, CachedOriginProps> {
  async fetch(request: Request): Promise<Response> {
    const { audience } = this.ctx.props
    const env = this.env
    const url = new URL(request.url)

    // checkBotRateLimit runs here — inside CachedOrigin — specifically because this class only
    // ever executes on a genuine platform cache MISS (see class doc comment above): a real HIT
    // short-circuits before this code runs, so gating here is what makes cached responses free
    // for rate-limiting purposes, matching checkBotRateLimit's own MISS-only doc comment in
    // rate-limit.mts. dispatchToCachedOrigin() relays the bot tier/IP via headers rather than
    // ctx.props specifically because they must never affect the platform cache key — only
    // audience/isRsc partition it.
    if (request.headers.get(DISPATCH_BOT_TIER_HEADER) === 'unknown') {
      const botAllowed = await checkBotRateLimit({
        env,
        method: request.method,
        pathname: url.pathname,
        ip: request.headers.get(DISPATCH_IP_HEADER),
      })
      if (!botAllowed) {
        return edgeErrorResponse(429, 'Too Many Requests', 'RATE_LIMIT', { 'retry-after': '60' })
      }
    }

    const target = getRouteTarget(url.pathname)
    const pathOverride = getOriginPathOverride(url.pathname) ?? undefined

    if (target === 'sitemaps' && !pathOverride) {
      return edgeErrorResponse(404, 'Not Found', 'NOT_FOUND')
    }

    if (url.pathname === EDGE_CACHE_CANARY_PATH) {
      if (isProductionMode(env)) return edgeErrorResponse(404, 'Not Found', 'NOT_FOUND')
      if (request.headers.get(INTERNAL_CANARY_FAULT_HEADER) === 'sie') {
        return edgeErrorResponse(503, 'Canary origin unavailable', 'SERVICE_UNAVAILABLE')
      }
      return finalizeCachedOriginResponse(createEdgeCacheCanaryResponse(), {
        audience,
        cacheTagOverride: EDGE_CACHE_CANARY_TAG,
        env,
        pathname: url.pathname,
        target,
      })
    }

    const originResult = resolveOrigin(target, env)
    if ('error' in originResult) return originResult.error
    const { origin } = originResult

    // Stamped in place of a real nonce so the same cached bytes are valid for
    // every client; the gateway swaps it for a fresh per-request nonce on
    // every serve (see nonce-rewrite.mts). The gateway only dispatches
    // target==='web' requests here when this secret is configured — see
    // request-handler.mts's canDispatchToCache — so it is guaranteed
    // non-empty whenever target === 'web' actually reaches this line.
    const placeholderNonce = env.CACHE_PLACEHOLDER_NONCE ?? ''
    const isProduction = isProductionMode(env)
    const webCsp =
      target === 'web'
        ? buildWebCsp(env.CSP_ASSET_ORIGIN, {
            browserUploadOrigins: env.CSP_BROWSER_UPLOAD_ORIGINS,
            production: isProduction,
            nonce: placeholderNonce,
          })
        : ''

    // Reuse the gateway request ID so backend fan-out remains client-traceable on a MISS.
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
    const originRequest = buildWorkerOriginRequest({
      canonicalSitemapUrl: null,
      cspNonce: placeholderNonce,
      edgeSession: { kind: 'anon-passthrough' },
      env,
      forceIdentityEncoding: true,
      origin,
      pathOverride,
      request: stripDispatchOnlyHeaders(request),
      requestId,
      requestKind: 'cache-fill',
      stripCookieNames: new Set(),
      stripAllCookies: true,
      target,
      webCsp,
    })

    const originFetch = await fetchOriginResponse(originRequest, {
      botTier: null,
      countryCode: null,
      requestId,
      target,
    })
    if ('error' in originFetch) return originFetch.error
    const { response: originResponse } = originFetch

    return finalizeCachedOriginResponse(originResponse, {
      audience,
      env,
      pathname: url.pathname,
      target,
    })
  }

  /**
   * RPC-only purge entry point (see EdgeExecutionContext.exports.CachedOrigin.purge in
   * types.mts and the /infra/cache-purge route that calls it). Scoped to this
   * entrypoint's own Workers Cache namespace via ctx.cache.purge({ tags }) — it cannot
   * purge any other entrypoint's cache. Throws rather than silently no-opping when
   * ctx.cache is unavailable: a silent no-op here would fail open on a cache-correctness
   * path (stale content would keep serving with no error signal).
   */
  async purge(tags: string[]): Promise<CachePurgeResult> {
    if (!this.ctx.cache) {
      throw new Error('Workers Cache purge API unavailable on this execution context')
    }
    return this.ctx.cache.purge({ tags })
  }
}
