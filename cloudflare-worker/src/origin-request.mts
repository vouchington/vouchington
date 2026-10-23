import { ensureSession } from './auth/session-mint.mts'
import { replaceSessionCookies } from './cookies.mts'
import { isOAuthClientAuthenticatedRoute } from './oauth-authorization-server-routing.mts'
import { captureWorkerException } from './sentry.mts'
import {
  buildOriginRequest,
  NEXTJS_INTERNAL_HEADERS_TO_STRIP,
  fetchOriginResponse as fetchOriginResponseFromOrigin,
} from '@vouchington/edge'
import type { BotTier } from './bot-tier.mts'
import type { RouteTarget } from './routing.mts'
import type { Env } from './types.mts'
import {
  applyBackendClientInfoHeaders,
  REQUEST_KIND_HEADER,
  type BackendRequestKind,
} from './client-info.mts'
import { stripStagingControlHeaders } from './staging-control-headers.mts'

type OriginRequestOptions = {
  canonicalSitemapUrl: URL | null
  cspNonce: string
  edgeSession: Awaited<ReturnType<typeof ensureSession>>
  env: Env
  /** Forces `accept-encoding: identity` on the origin fetch — see buildOriginRequest's
   * doc comment. Only CachedOrigin fills set this; the BYPASS path (origin-bypass.mts)
   * leaves it unset so it keeps forwarding the real client's Accept-Encoding. */
  forceIdentityEncoding?: boolean
  origin: string
  pathOverride?: string
  request: Request
  requestId: string
  target: RouteTarget
  webCsp: string
  stripCookieNames: Set<string>
  stripAllCookies: boolean
  requestKind?: BackendRequestKind
}

export function buildWorkerOriginRequest({
  canonicalSitemapUrl,
  cspNonce,
  edgeSession,
  env,
  forceIdentityEncoding,
  origin,
  pathOverride,
  request,
  requestId,
  target,
  webCsp,
  stripCookieNames,
  stripAllCookies,
  requestKind,
}: OriginRequestOptions): Request {
  let originRequestSource: Request = canonicalSitemapUrl
    ? new Request(canonicalSitemapUrl.toString(), request)
    : request

  if (edgeSession.kind === 'anon-minted') {
    const updatedCookieHeader = replaceSessionCookies(originRequestSource.headers.get('cookie'), {
      dt: edgeSession.dt,
      st: edgeSession.st,
    })
    const updatedHeaders = new Headers(originRequestSource.headers)
    updatedHeaders.set('cookie', updatedCookieHeader)
    originRequestSource = new Request(originRequestSource, { headers: updatedHeaders })
  }

  if (target === 'web') {
    const updatedHeaders = new Headers(originRequestSource.headers)
    updatedHeaders.set('x-nonce', cspNonce)
    updatedHeaders.set('content-security-policy', webCsp)
    originRequestSource = new Request(originRequestSource, { headers: updatedHeaders })
  }

  const appHeaders = new Headers(originRequestSource.headers)
  stripStagingControlHeaders(appHeaders)
  appHeaders.delete('x-voucha-client-ja4')
  const ja4 = (request as Request & { cf?: { botManagement?: { ja4?: string } } }).cf?.botManagement
    ?.ja4
  if (target === 'backend' && typeof ja4 === 'string' && ja4.length > 0)
    appHeaders.set('x-voucha-client-ja4', ja4)
  appHeaders.delete('x-user-id')
  appHeaders.delete('x-device-token')
  appHeaders.delete('x-session-token')
  appHeaders.delete('x-voucha-gpc')
  appHeaders.delete(REQUEST_KIND_HEADER)
  if (request.headers.get('sec-gpc') === '1') appHeaders.set('x-voucha-gpc', '1')
  originRequestSource = new Request(originRequestSource, { headers: appHeaders })

  const originRequest = buildOriginRequest(originRequestSource, {
    origin,
    stripCookieNames,
    stripAllCookies: target === 'sitemaps' || stripAllCookies,
    pathOverride,
    requestId,
    sharedSecret: {
      header: 'x-cf-worker-secret',
      value: target === 'backend' ? env.CF_WORKER_SECRET : undefined,
    },
    forceIdentityEncoding,
    preserveNonBasicAuthorization: target === 'backend',
    preserveBasicAuthorization:
      target === 'backend' &&
      isOAuthClientAuthenticatedRoute(new URL(originRequestSource.url).pathname),
    stripHeaders: NEXTJS_INTERNAL_HEADERS_TO_STRIP,
  })
  if (target === 'backend') {
    const headers = new Headers(originRequest.headers)
    applyBackendClientInfoHeaders(headers, {
      gitCommit: env.GIT_COMMIT,
      method: originRequestSource.method,
      requestKind,
      requestOrigin: new URL(originRequestSource.url).origin,
    })
    return new Request(originRequest, { headers })
  }

  // Lets web's generateMetadata() suppress Sentry trace meta on a cache-fill render, so it
  // never gets frozen into the shared cache entry (see the published edge nonce rewrite's doc comment for why
  // that would otherwise misattribute traces on every later HIT). Request→origin only, and
  // buildOriginRequest above already stripped any client-supplied copy — this can't reach a
  // client via a response header or leak into cached bytes.
  if (target === 'web' && requestKind === 'cache-fill') {
    const headers = new Headers(originRequest.headers)
    headers.set(REQUEST_KIND_HEADER, requestKind)
    return new Request(originRequest, { headers })
  }

  return originRequest
}

type OriginFetchMetadata = {
  botTier: BotTier | null
  countryCode: string | null
  requestId: string
  target: OriginRequestOptions['target']
}

export async function fetchWorkerOriginResponse(
  originRequest: Request,
  metadata: OriginFetchMetadata,
): Promise<{ duration: number; response: Response } | { error: Response }> {
  return fetchOriginResponseFromOrigin(originRequest, {
    onError(error) {
      captureWorkerException(error, {
        routeTarget: metadata.target,
        botTier: metadata.botTier,
        countryCode: metadata.countryCode,
        requestId: metadata.requestId,
      })
      console.error('Origin fetch failed:', error)
    },
  })
}
