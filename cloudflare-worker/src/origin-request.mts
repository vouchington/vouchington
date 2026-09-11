import { ensureSession } from './auth/session-mint.mts'
import { replaceSessionCookies } from './cookies.mts'
import { captureWorkerException } from './sentry.mts'
import { buildOriginRequest } from './proxy.mts'
import { edgeErrorResponse } from './error-response.mts'
import type { BotTier } from './bot-tier.mts'
import type { RouteTarget } from './routing.mts'
import type { Env } from './types.mts'
import {
  applyBackendClientInfoHeaders,
  REQUEST_KIND_HEADER,
  type BackendRequestKind,
} from './client-info.mts'

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

  const originRequest = buildOriginRequest(
    originRequestSource,
    origin,
    stripCookieNames,
    target === 'backend' ? env.CF_WORKER_SECRET : undefined,
    pathOverride,
    target === 'sitemaps' || stripAllCookies,
    requestId,
    forceIdentityEncoding,
    target === 'backend',
  )
  if (target === 'backend') {
    const headers = new Headers(originRequest.headers)
    applyBackendClientInfoHeaders(headers, { gitCommit: env.GIT_COMMIT, requestKind })
    return new Request(originRequest, { headers })
  }

  // Lets web's generateMetadata() suppress Sentry trace meta on a cache-fill render, so it
  // never gets frozen into the shared cache entry (see nonce-rewrite.mts's doc comment for why
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

export async function fetchOriginResponse(
  originRequest: Request,
  metadata: {
    botTier: BotTier | null
    countryCode: string | null
    requestId: string
    target: OriginRequestOptions['target']
  },
): Promise<{ duration: number; response: Response } | { error: Response }> {
  const fetchStart = Date.now()
  try {
    const response = await fetch(originRequest)
    return { duration: Date.now() - fetchStart, response }
  } catch (error) {
    captureWorkerException(error, {
      routeTarget: metadata.target,
      botTier: metadata.botTier,
      countryCode: metadata.countryCode,
      requestId: metadata.requestId,
    })
    console.error('Origin fetch failed:', error)
    return { error: edgeErrorResponse(502, 'Bad Gateway', 'BAD_GATEWAY') }
  }
}
