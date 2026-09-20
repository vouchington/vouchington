import { stripCookies } from './cookies.mts'
import { REQUEST_KIND_HEADER } from './client-info.mts'
import { stripStagingControlHeaders } from './staging-control-headers.mts'

const METHOD_WITHOUT_BODY = new Set(['GET', 'HEAD'])
export const CLIENT_SUPPLIED_PROXY_HEADERS_TO_STRIP = [
  'cf-connecting-ip',
  'forwarded',
  'true-client-ip',
  'via',
  'x-forwarded-for',
  'x-forwarded-port',
  'x-forwarded-prefix',
  'x-forwarded-scheme',
  'x-forwarded-server',
  'x-forwarded-ssl',
  'x-forwarded-uri',
  'x-http-method',
  'x-http-method-override',
  'x-method-override',
  'x-original-url',
  'x-real-ip',
  'x-rewrite-url',
] as const

export const buildOriginRequest = (
  request: Request,
  origin: string,
  stripCookieNames: Set<string>,
  cfWorkerSecret?: string,
  pathOverride?: string | null,
  stripAllCookies = false,
  requestId?: string,
  forceIdentityEncoding = false,
  preserveNonBasicAuthorization = false,
  preserveBasicAuthorization = false,
): Request => {
  // Capture the original host/protocol before mutating url for the origin.
  const { host: originalHost, protocol: originalProtocol } = new URL(request.url)
  const originUrl = new URL(origin)
  const url = new URL(request.url)
  url.protocol = originUrl.protocol
  url.host = originUrl.host
  if (pathOverride) {
    const overrideUrl = new URL(pathOverride, url)
    const mergedSearchParams = new URLSearchParams(url.search)
    overrideUrl.searchParams.forEach((value, key) => {
      mergedSearchParams.set(key, value)
    })
    url.pathname = overrideUrl.pathname
    url.search = mergedSearchParams.toString()
  }

  const headers = new Headers(request.headers)

  if (stripAllCookies) {
    headers.delete('cookie')
  } else {
    const sanitizedCookieHeader = stripCookies(headers.get('cookie'), stripCookieNames)
    if (!sanitizedCookieHeader) {
      headers.delete('cookie')
    } else {
      headers.set('cookie', sanitizedCookieHeader)
    }
  }

  for (const header of CLIENT_SUPPLIED_PROXY_HEADERS_TO_STRIP) {
    headers.delete(header)
  }
  headers.delete('x-cf-worker-secret')
  headers.delete('x-user-id')
  headers.delete('x-device-token')
  headers.delete('x-session-token')
  stripStagingControlHeaders(headers)
  // Authorization reaches origins only when the target-aware caller opts in. Basic is narrower:
  // only OAuth token/revocation routes preserve it.
  const authorization = headers.get('authorization') ?? ''
  const isBasicAuthorization = /^basic\s/i.test(authorization)
  if (
    (isBasicAuthorization && !preserveBasicAuthorization) ||
    (!isBasicAuthorization && !preserveNonBasicAuthorization)
  ) {
    headers.delete('authorization')
  }
  // The worker always owns request IDs so external values cannot poison traces or logs.
  headers.delete('x-request-id')
  // Normalize Global Privacy Control for origins while preventing clients from
  // spoofing the internal header directly.
  headers.delete('x-voucha-gpc')
  headers.delete(REQUEST_KIND_HEADER)
  if (request.headers.get('sec-gpc') === '1') {
    headers.set('x-voucha-gpc', '1')
  }

  // Strip Next.js-internal headers that external clients must never send.
  // Each blocks a known CVE class:
  //   x-middleware-subrequest      — CVE-2025-29927 (auth bypass)
  //   x-middleware-subrequest-id   — CVE-2025-30218 (data leak)
  //   x-nextjs-data                — GHSA-3g8h-86w9-wvmq (redirect cache poisoning)
  //   x-now-route-matches          — CVE-2025-32421 (pageProps leak)
  //   next-resume                  — CVE-2026-44579 (DoS)
  //   next-action-nonce            — defense-in-depth around CVE-2026-44581
  // Note: `rsc` is intentionally NOT stripped — Next.js requires the header for
  // RSC navigation to function. CVE-2025-49005 / CVE-2026-44576 / CVE-2026-44582
  // are mitigated structurally by ctx.props.isRsc (see types.mts's CachedOriginProps),
  // which the Workers Cache platform partitions the shared cache key by — an RSC
  // fetch can never collide with a full-HTML entry for the same URL.
  headers.delete('x-middleware-subrequest')
  headers.delete('x-middleware-subrequest-id')
  headers.delete('x-nextjs-data')
  headers.delete('x-now-route-matches')
  headers.delete('next-resume')
  headers.delete('next-action-nonce')

  // Set forwarding headers so the origin knows the original client request.
  // Next.js Server Actions validate origin against x-forwarded-host.
  headers.set('x-forwarded-host', originalHost)
  headers.set('x-forwarded-proto', originalProtocol.replace(':', ''))

  // Forward the real client IP so the origin can log/rate-limit by IP.
  const clientIp = request.headers.get('cf-connecting-ip')
  if (clientIp) {
    headers.set('x-forwarded-for', clientIp)
  }

  // Local dev avoids miniflare double-compressing a body; forceIdentityEncoding does the
  // same for CachedOrigin fills, since a shared cache entry can't vary per Accept-Encoding.
  if (
    originUrl.hostname === 'localhost' ||
    originUrl.hostname === '127.0.0.1' ||
    forceIdentityEncoding
  ) {
    headers.set('accept-encoding', 'identity')
  }

  // Set the shared secret so the origin can verify requests came through the worker.
  if (cfWorkerSecret) {
    headers.set('x-cf-worker-secret', cfWorkerSecret)
  }

  // Propagate the request ID for distributed tracing across CF Worker → origin.
  if (requestId) {
    headers.set('x-request-id', requestId)
  }

  const requestInit: RequestInit = {
    method: request.method,
    headers,
    // Use 'manual' so 3xx responses are forwarded to the client as-is.
    // 'follow' (the browser default) would silently resolve the redirect
    // inside the worker, returning the final 200 with the original URL.
    redirect: 'manual',
  }

  if (!METHOD_WITHOUT_BODY.has(request.method)) {
    requestInit.body = request.body
    // Node.js/undici requires 'duplex: half' when streaming a body.
    // The CF Workers runtime silently ignores this option.
    ;(requestInit as any).duplex = 'half'
  }

  return new Request(url, requestInit)
}

// Append additional headers to a response, preserving all existing ones (including set-cookie).
export const appendHeaders = (
  response: Response,
  entries: ReadonlyArray<readonly [string, string]>,
): Response => {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    headers.append(key, value)
  })
  for (const [key, value] of entries) {
    headers.append(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// Copy headers preserving all set-cookie values, then set the provided entries.
// new Headers(existing) may deduplicate set-cookie; iterating entries avoids this.
export const withHeaders = (response: Response, entries: Record<string, string>): Response => {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    headers.append(key, value)
  })
  for (const [key, value] of Object.entries(entries)) {
    headers.set(key, value)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
