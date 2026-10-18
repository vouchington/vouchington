import { isAuthShapedSessionToken, verifyBackendSessionTokens } from './auth/jwt.mts'
import { ensureSession } from './auth/session-mint.mts'
import type { BotTier } from './bot-tier.mts'
import { getCachePolicy } from './cache-policy.mts'
import { canUseCache, hasReferralAttributionSignal, isRscRequest } from './cache-route-policy.mts'
import { dispatchToCachedOrigin } from './cache-dispatch.mts'
import {
  DEFAULT_NO_VARY_SEARCH_PARAM_NAMES,
  normalizeCacheUrl,
  parseCookies,
  withHeaders,
} from '@vouchington/edge'
import { handleCachePurgeRequest } from './cache-purge-route.mts'
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
import { getWorkerRequestConfig } from './request-config.mts'
import { getCanonicalSitemapUrl, getRouteTarget, rejectRemovedSideloadRoute } from './routing.mts'
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
  const removedSideload = rejectRemovedSideloadRoute(pathname)
  if (removedSideload) return removedSideload
  const geoBlockedResponse = getGeoBlockedResponse(request, env)
  if (geoBlockedResponse) return geoBlockedResponse
  const isExternalIngress = isExternalServerToServerIngress(method, pathname)
  const basicAuthRateLimit = await getBasicAuthRateLimitRejection(request, env, url, ip)
  if (basicAuthRateLimit.response) return basicAuthRateLimit.response
  const getRejection = (isRateLimitExempt: boolean, isServerAction = false) =>
    basicAuthRateLimit.applies
      ? Promise.resolve(null)
      : rejectByIdentityLimit(env, method, pathname, ip, isRateLimitExempt, botTier, isServerAction)
  const basicAuthResponse = getBasicAuthResponse(request, env, url)
  if (basicAuthResponse) return basicAuthResponse
  if (canaryFault === 'unexpected-throw') throw new Error('Injected staging canary failure')
  // Serve Worker-owned responses before session, cache-dispatch, and rate-limit decisions.
  const staticInlineResponse = getStaticInlineResponse(request, url, env)
  if (staticInlineResponse) return staticInlineResponse
  // Early in-worker interceptions must rate-limit before getRouteTarget(). Cache purge calls
  // CachedOrigin.purge() directly; other /infra/* routes proxy to the backend.
  const getInterceptResponse = async (handler: () => Promise<Response>) =>
    (await getRejection(false)) ?? handler()
  if (pathname === '/monitoring' && method === 'POST') {
    return getInterceptResponse(() => handleSentryTunnel(request, env))
  }
  if (pathname === '/infra/cache-purge' && method === 'POST') {
    // Secret-gated internal purge route. It must not share the public anonymous POST
    // rate-limit bucket, or a burst of legitimate purges is 429'd before the secret check
    // and leaves stale Workers Cache entries until TTL or retry.
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
  // Signed `st` with `uid: null` is normal for anon visitors. Only a formerly authenticated
  // session that fails edge verification is stale auth (see isAuthShapedSessionToken).
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

  // Web dispatch fails closed without a sufficiently long CSP nonce (same check as env warnings).
  const canUseCachedOriginForWeb =
    target !== 'web' || isCachePlaceholderNonceValid(env.CACHE_PLACEHOLDER_NONCE)
  // Header-less RPC cannot relay RSC navigation state; keep RSC out until staging verifies nonce
  // behavior for reconstructed requests.
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
    // Normalize URL params so marketing-only differences share one cache entry.
    const dispatchUrl = new URL(
      normalizeCacheUrl((canonicalSitemapUrl ?? url).toString(), {
        stripParams: [...DEFAULT_NO_VARY_SEARCH_PARAM_NAMES, '_rsc'],
      }),
    )
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
