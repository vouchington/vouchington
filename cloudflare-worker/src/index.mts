import { withSentry } from '@sentry/cloudflare'
import { getBotTier, isVerifiedBotRequest } from './bot-tier.mts'
import { logCacheDiagnostic } from './cache-diagnostics.mts'
import { isAuthCallbackRoute } from './cache-route-policy.mts'
import { buildDashboardCsp, buildWebCsp } from './csp.mts'
import { addDiscoveryHeaders } from './discovery.mts'
import { serveDocs, type ServeDocs } from './docs.mts'
import {
  warnIfCachePlaceholderNonceMissing,
  warnIfCspAssetOriginInvalid,
  warnIfProductionValueInvalid,
  warnIfSentryConfigurationInvalid,
} from './env-validation.mts'
import { edgeErrorResponse } from './error-response.mts'
import { isProductionMode } from './production-mode.mts'
import { withHeaders } from './proxy.mts'
import { getRouteTarget, isAdminBackendRoute } from './routing.mts'
import { addSecurityHeaders, shouldPreserveOriginNoReferrer } from './security-headers.mts'
import { captureWorkerException, createSentryOptions } from './sentry.mts'
import { fetchInner as defaultFetchInner } from './request-handler.mts'
import type { EdgeExecutionContext, Env } from './types.mts'
import { warnIfWorkerSecretMisconfigured } from './worker-secret-warnings.mts'

// Re-exported so Wrangler's `exports.CachedOrigin` entrypoint resolves
// against this same module — wrangler requires named entrypoints to live alongside `main`.
export { CachedOrigin } from './cached-origin.mts'

type WorkerFetchInner = typeof defaultFetchInner
type RouteResolver = typeof getRouteTarget

export function createWorker(
  dependencies: {
    fetchInner?: WorkerFetchInner
    captureException?: typeof captureWorkerException
    resolveRoute?: RouteResolver
    serveDocs?: ServeDocs
  } = {},
) {
  const fetchInner = dependencies.fetchInner ?? defaultFetchInner
  const captureException = dependencies.captureException ?? captureWorkerException
  const resolveRoute = dependencies.resolveRoute ?? getRouteTarget
  const serveDocsRequest = dependencies.serveDocs ?? serveDocs
  return {
    async fetch(request: Request, env: Env, context: EdgeExecutionContext): Promise<Response> {
      // Generate per-request ID here so every response path — including errors, rate-limits,
      // inline responses, and cache HITs — gets a fresh UUID on the final response.
      const requestId = crypto.randomUUID()
      const cspNonce = crypto.randomUUID().replace(/-/g, '')
      let routeTarget: ReturnType<RouteResolver> | undefined
      let botTier: ReturnType<typeof getBotTier> = null
      let isOauthCallback = false
      try {
        // The private docs deployment binds DOCS_BUCKET plus required Basic Auth, and nothing else this gateway
        // depends on (CF_WORKER_SECRET, CSP, bot tiers, rate limiters). Branch before them.
        if (env?.DOCS_BUCKET) {
          const response = await serveDocsRequest(request, env)
          return addSecurityHeaders(
            withHeaders(response, { 'x-request-id': requestId }),
            true,
            false,
          )
        }
        warnIfWorkerSecretMisconfigured(env)
        warnIfProductionValueInvalid(env)
        warnIfSentryConfigurationInvalid(env)
        warnIfCspAssetOriginInvalid(env)
        warnIfCachePlaceholderNonceMissing(env)
        const isProduction = isProductionMode(env)
        botTier = getBotTier(request.headers.get('user-agent'), {
          verifiedBot: isVerifiedBotRequest(request),
        })
        const url = new URL(request.url)
        isOauthCallback = isAuthCallbackRoute(url.pathname)
        routeTarget = resolveRoute(url.pathname)
        const webCsp =
          routeTarget === 'web'
            ? buildWebCsp(env.CSP_ASSET_ORIGIN, {
                browserUploadOrigins: env.CSP_BROWSER_UPLOAD_ORIGINS,
                production: isProduction,
                nonce: cspNonce,
                sentryTunnelPreviousWebDsn: env.SENTRY_TUNNEL_PREVIOUS_WEB_DSN,
                sentryWebDsn: env.SENTRY_WEB_DSN,
              })
            : ''
        const responseCsp = isAdminBackendRoute(url.pathname) ? buildDashboardCsp() : webCsp
        const response = await fetchInner(
          request,
          env,
          context,
          requestId,
          botTier,
          cspNonce,
          webCsp,
        )
        // A successful WebSocket upgrade carries a non-standard `webSocket` property that
        // withHeaders() cannot preserve. Only skip security headers when actually upgraded.
        if (response.status === 101 && (response as unknown as { webSocket: unknown }).webSocket) {
          return response
        }
        const responseHeaders: Record<string, string> = { 'x-request-id': requestId }
        if (env.NOINDEX?.toLowerCase() === 'true') {
          responseHeaders['x-robots-tag'] = 'noindex, nofollow, noarchive'
        }
        if (botTier !== null) responseHeaders['x-voucha-bot-tier'] = botTier
        if (request.headers.get('sec-gpc') === '1') responseHeaders['x-voucha-gpc'] = '1'
        const responseWithRequestHeaders = withHeaders(
          addDiscoveryHeaders(response, url, env),
          responseHeaders,
        )
        const securedResponse = addSecurityHeaders(
          responseWithRequestHeaders,
          isProduction,
          env.HSTS_PRELOAD?.toLowerCase() === 'true',
          responseCsp || undefined,
          isOauthCallback ? 'unsafe-none' : undefined,
          shouldPreserveOriginNoReferrer(url),
        )
        logCacheDiagnostic(env, {
          requestId,
          routeTarget,
          methodClass: request.method === 'GET' || request.method === 'HEAD' ? 'GET' : 'MUTATING',
          status: securedResponse.status,
          cacheDisposition: securedResponse.headers.get('x-voucha-cache'),
        })
        return securedResponse
      } catch (error) {
        try {
          captureException(error, { routeTarget, botTier, requestId })
        } catch {
          // Error reporting must never replace the secured fallback response.
        }
        const recoveryEnv = env ?? ({} as Env)
        const recoveryIsProduction = isProductionMode(recoveryEnv)
        const errorResponse = withHeaders(
          edgeErrorResponse(500, 'Internal Server Error', 'INTERNAL_ERROR'),
          { 'x-request-id': requestId },
        )
        return addSecurityHeaders(
          errorResponse,
          recoveryIsProduction,
          recoveryEnv.HSTS_PRELOAD?.toLowerCase() === 'true',
          buildWebCsp(recoveryEnv.CSP_ASSET_ORIGIN, {
            browserUploadOrigins: recoveryEnv.CSP_BROWSER_UPLOAD_ORIGINS,
            production: recoveryIsProduction,
            nonce: cspNonce,
            sentryTunnelPreviousWebDsn: recoveryEnv.SENTRY_TUNNEL_PREVIOUS_WEB_DSN,
            sentryWebDsn: recoveryEnv.SENTRY_WEB_DSN,
            requireBrowserUploadOrigins: false,
          }),
          isOauthCallback ? 'unsafe-none' : undefined,
        )
      }
    },
  }
}

// Defined as a named variable so withSentry() can wrap it in place.
const worker = createWorker()

// Wrap with Sentry for per-request initialization, distributed tracing, and automatic flushing.
// withSentry() mutates worker.fetch in-place and returns the same object.
// When enabled: false (dev/CI/test), all Sentry calls are no-ops.
withSentry(createSentryOptions, worker)

export default worker
