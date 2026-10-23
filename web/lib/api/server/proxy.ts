import { buildWorkerSecretHeader } from '../worker-secret'
import { buildWebClientInfoHeaders } from './client-info'
import { isValidCacheTag } from '@vouchington/utils/cache-tags'

export async function getPostAuthorCacheTag(
  backendUrl: string,
  idOrSlug: string,
  forwardedIpHeaders: Record<string, string>,
): Promise<{ ok: true; tag: string | null } | { ok: false }> {
  try {
    const url = buildBackendApiUrl(backendUrl, `/api/v1/posts/${encodeURIComponent(idOrSlug)}`)
    const response = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      headers: {
        ...buildWorkerSecretHeader(),
        ...buildWebClientInfoHeaders(),
        ...forwardedIpHeaders,
      },
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) {
      await response.body?.cancel()
      return { ok: false }
    }
    const tag = response.headers.get('Cache-Tag')
    await response.body?.cancel()
    if (tag !== null && (!isValidCacheTag(tag) || !tag.startsWith('user:'))) {
      return { ok: false }
    }
    return { ok: true, tag }
  } catch {
    return { ok: false }
  }
}

export async function recordProxyReferralAttribution(
  backendUrl: string,
  body: {
    referrer: string
    landing_url: string
    utm?: {
      utm_source: string | null
      utm_medium: string | null
      utm_campaign: string | null
      utm_content: string | null
    }
  },
  session: { dt: string; st: string },
  forwardedIpHeaders: Record<string, string>,
): Promise<Response> {
  const attributionUrl = buildBackendApiUrl(backendUrl, '/api/v1/attribution/referrer')
  // backendUrl is trusted deployment configuration and is normalized before use.
  return fetch(attributionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Origin and x-forwarded-proto must agree so the backend origin guard
      // computes expectedOrigin = requestOrigin. When using Service Connect
      // internal URLs (http://backend:2900), both must use 'http'.
      ...buildBackendOriginHeaders(backendUrl),
      ...buildWorkerSecretHeader(),
      ...buildWebClientInfoHeaders(),
      ...forwardedIpHeaders,
      cookie: `dt=${session.dt}; st=${session.st}`,
    },
    body: JSON.stringify(body),
  })
}

function buildBackendOriginHeaders(backendUrl: string): Record<string, string> {
  const url = new URL(backendUrl)
  return {
    Origin: url.origin,
    'x-forwarded-proto': url.protocol.slice(0, -1),
  }
}

function buildBackendApiUrl(backendUrl: string, pathname: string): string {
  const url = new URL(backendUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported backend URL protocol: ${url.protocol}`)
  }
  url.pathname = pathname
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function getProxyClientHeaders(request: { headers: Headers }): Record<string, string> {
  const headers: Record<string, string> = {}
  const userAgent = request.headers.get('user-agent')
  if (userAgent) headers['user-agent'] = userAgent
  const forwardedFor = request.headers.get('x-forwarded-for')
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor
  if (cfConnectingIp) headers['cf-connecting-ip'] = cfConnectingIp
  return headers
}
