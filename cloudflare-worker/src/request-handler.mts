import { isAuthShapedSessionToken, verifyBackendSessionTokens } from './auth/jwt.mts'
import { ensureSession } from './auth/session-mint.mts'
import type { BotTier } from './bot-tier.mts'
import { getCachePolicy } from './cache-policy.mts'
import { canUseCache, hasReferralAttributionSignal, isRscRequest } from './cache-route-policy.mts'
import { dispatchToCachedOrigin } from './cache-dispatch.mts'
import { normalizeCacheUrl } from './cache-no-vary-search.mts'
import { handleCachePurgeRequest } from './cache-purge-route.mts'
import { parseCookies } from './cookies.mts'
import { omitAtDefaultLocale, resolveEdgeUiLocale } from './edge-ui-locale.mts'
import {
  getIdentityRateLimitRejection,
  getServerActionRateLimitRejection,
} from './identity-rate-limit-rejection.mts'
import { getBasicAuthRateLimitRejection, getBasicAuthResponse } from './basic-auth.mts'
import { isCachePlaceholderNonceValid } from './env-validation.mts'
import { isExternalServerToServerIngress } from './external-server-ingress.mts'
import {
  getGeoBlockedResponse,
  getStaticInlineResponse,
  handleWebSocketRequest,
} from './inline-responses.mts'
import { getMaintenanceResponse } from './maintenance.mts'
import { runOriginBypass } from './origin-bypass.mts'
import { isProductionMode } from './production-mode.mts'
import { withHeaders } from './proxy.mts'
import { getWorkerRequestConfig } from './request-config.mts'
import { getCanonicalSitemapUrl, getRouteTarget } from './routing.mts'
import { handleSentryTunnel } from './sentry-tunnel.mts'
import { isNextImageOptimizerPath, isStaticWebAssetPath } from './static-web-assets.mts'
import { EDGE_CACHE_CANARY_PATH, resolveStagingCanaryControl } from './staging-canary.mts'
import type { EdgeExecutionContext, Env } from './types.mts'

export async function fetchInner(
  incomingRequest: Request,
  env: Env,
  context: EdgeExecutionContext,
  requestId: string,
  botTier: BotTier | null,
  cspNonce: string,
  webCsp: string,
): Promise<Response> {
  let request = incomingRequest
  const url = new URL(request.url)
  const canonicalSitemapUrl = getCanonicalSitemapUrl(url)
  const websocketResponse = await handleWebSocketRequest(request, url, env)
  if (websocketResponse) return websocketResponse
  const canaryControl = resolveStagingCanaryControl(request, env)
  if ('response' in canaryControl) return canaryControl.response
  request = canaryControl.request
  const canaryFault = canaryControl.fault

  const maintenanceResponse = getMaintenanceResponse(request, env)
  if (maintenanceResponse) return maintenanceResponse
  const rejectByIdentityLimit = getIdentityRateLimitRejection
  const ip = request.headers.get('cf-connecting-ip')
  const method = request.method
  const pathname = url.pathname
  const isExternalIngress = isExternalServerToServerIngress(method, pathname)
  const basicAuthRateLimit = await getBasicAuthRateLimitRejection(request, env, url, ip)
  if (basicAuthRateLimit.response) return basicAuthRateLimit.response
  const getRejection = (isRateLimitExempt: boolean, isServerAction = false) =>
    basicAuthRateLimit.applies
      ? Promise.resolve(null)
      : rejectByIdentityLimit(env, method, pathname, ip, isRateLimitExempt, botTier, isServerAction)
  const basicAuthResponse = getBasicAuthResponse(request, env, url)
  if (basicAuthResponse) return basicAuthResponse
  const geoBlockedResponse = getGeoBlockedResponse(request, env)
  if (geoBlockedResponse) return geoBlockedResponse
  if (canaryFault === 'unexpected-throw') throw new Error('Injected staging canary failure')
  // Serve Worker-owned responses before session, cache-dispatch, and rate-limit decisions.
  const staticInlineResponse = getStaticInlineResponse(request, url, env)
  if (staticInlineResponse) return staticInlineResponse
  // Rate-limited early interceptions: handled in-worker, not proxied to origin, so each must
  // run before getRouteTarget()'s routing below. /infra/cache-purge is unlike any other /infra/*
  // path (those proxy to backend) — it calls context.exports.CachedOrigin.purge() directly.
  const getInterceptResponse = async (handler: () => Promise<Response>) =>
    (await getRejection(false)) ?? handler()
  if (pathname === '/monitoring' && method === 'POST') {
    return getInterceptResponse(() => handleSentryTunnel(request, env))
  }
  if (pathname === '/infra/cache-purge' && method === 'POST') {
    // Secret-gated (CF_WORKER_SECRET, validated inside handleCachePurgeRequest) internal-only
    // route driven by the backend's coalesced/deduped purge queue — must not share the
    // public anonymous-mutating rate limiter's bucket with arbitrary anon POST traffic from
    // the same IP, or a burst of legitimate purges gets 429'd before the secret check ever
    // runs, leaving stale Workers Cache entries until TTL/retry recovery.
    return handleCachePurgeRequest(request, env, context, canaryFault)
  }
  const target = getRouteTarget(url.pathname)
  const authorization = request.headers.get('authorization')
  const hasNonBasicBackendAuthorization =
    target === 'backend' && authorization !== null && !/^basic\s/i.test(authorization)
  const countryCode = request.headers.get('cf-ipcountry')
  const cookieHeader = request.headers.get('cookie')
  const cookies = parseCookies(cookieHeader)
  const deviceToken = cookies.get('dt') ?? null
  const sessionToken = cookies.get('st') ?? null
  const tokenPayloads = await verifyBackendSessionTokens(deviceToken, sessionToken, env)
  const { devicePayload, sessionPayload, sessionCachePayload } = tokenPayloads
  // A validly-signed `st` with `uid: null` is normal for a returning anon visitor and must stay
  // on the anon-cache path. Only an `st` that once claimed a real user but fails edge verification
  // indicates a stale auth attempt (e.g. an expired session the backend can cold-refresh from
  // `dt`) — see isAuthShapedSessionToken's doc comment and CachePolicyInput.
  const hasUnverifiedSessionCookies = !sessionCachePayload && isAuthShapedSessionToken(sessionToken)

  const cachePolicy = getCachePolicy({
    pathname,
    botTier,
    isAuthenticated: Boolean(sessionCachePayload),
    hasReferralAttributionSignal: hasReferralAttributionSignal(url),
    hasFeatureFlagOverrideCookie: cookies.has('ff'),
    hasUnverifiedSessionCookies,
    ...getWorkerRequestConfig(env),
  })

  const isEffectivelyFullyCachedRoute =
    cachePolicy.fullyCachedRoute && (target !== 'web' || isStaticWebAssetPath(url.pathname))

  // Web dispatch requires CACHE_PLACEHOLDER_NONCE and fails closed otherwise. It must
  // pass the same minimum-length check env-validation.mts warns on — a short-but-truthy
  // secret is guessable enough that its CSP nonce isn't meaningfully secret.
  const canUseCachedOriginForWeb =
    target !== 'web' || isCachePlaceholderNonceValid(env.CACHE_PLACEHOLDER_NONCE)
  // RSC stays excluded from dispatch (header-less RPC can't relay `rsc`) — a safety gate, not a
  // data-availability gap like props.lang below. Reconstructing `rsc: '1'` from ctx.props.isRsc
  // and lifting this gate await staging verification of the RSC-nav nonce risk (plan risk #2).
  const isRsc = isRscRequest(request, url)
  const canDispatchToCache =
    canUseCachedOriginForWeb &&
    !isNextImageOptimizerPath(pathname) &&
    !hasNonBasicBackendAuthorization &&
    !isRsc &&
    cachePolicy.audience !== null &&
    canUseCache(request, cachePolicy.mode) &&
    (!cachePolicy.fullyCachedRoute || isEffectivelyFullyCachedRoute)

  const isServerAction = target === 'web' && method === 'POST' && request.headers.has('next-action')
  const rateLimitRejection =
    basicAuthRateLimit.applies && isServerAction
      ? await getServerActionRateLimitRejection(env, method, pathname, ip)
      : await getRejection(cachePolicy.fullyCachedRoute && canDispatchToCache, isServerAction)
  if (rateLimitRejection) return rateLimitRejection

  const edgeSession =
    botTier !== null || isExternalIngress
      ? ({ kind: 'anon-passthrough' } as const)
      : await ensureSession(cookies, sessionCachePayload, devicePayload, sessionPayload, env)
  const isProduction = isProductionMode(env)

  if (canDispatchToCache && cachePolicy.audience) {
    // Canonical dispatch URL: strips tracking params + sorts the rest so requests differing
    // only by marketing params/order share one entry (see cache-no-vary-search.mts).
    const dispatchUrl = new URL(normalizeCacheUrl((canonicalSitemapUrl ?? url).toString()))
    // `lang` partitions only the anon audience — bots/static never vary by UI locale (#6994).
    const lang =
      cachePolicy.audience === 'anon'
        ? omitAtDefaultLocale(resolveEdgeUiLocale(request, sessionCachePayload))
        : undefined
    const dispatchedResponse = await dispatchToCachedOrigin({
      audience: cachePolicy.audience,
      botTier,
      canaryFault,
      context,
      cspNonce,
      dispatchUrl,
      edgeSession,
      env,
      ip,
      isProduction,
      isRsc,
      lang,
      method,
      requestId,
      target,
    })
    return pathname === EDGE_CACHE_CANARY_PATH
      ? withHeaders(dispatchedResponse, { 'cache-control': 'no-store, max-age=0, must-revalidate' })
      : dispatchedResponse
  }

  return runOriginBypass({
    botTier,
    cachePolicy,
    canonicalSitemapUrl,
    countryCode,
    cspNonce,
    edgeSession,
    env,
    forceStripAllCookies: isExternalIngress,
    ip,
    isEffectivelyFullyCachedRoute,
    isProduction,
    request,
    requestId,
    target,
    url,
    webCsp,
  })
}
