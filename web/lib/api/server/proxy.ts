import { buildWorkerSecretHeader } from '../worker-secret'
import { buildWebClientInfoHeaders } from './client-info'

export interface ProxySessionResponse {
  uid?: string | null
  dt?: string
  st?: string
  dte: number
  ste: number
  secure: boolean
}

export async function refreshProxySession(
  backendUrl: string,
  body: { dt?: string; st?: string },
  forwardedIpHeaders: Record<string, string>,
): Promise<ProxySessionResponse | null> {
  const sessionUrl = buildBackendApiUrl(backendUrl, '/api/v1/session')
  const backendOriginHeaders = buildBackendOriginHeaders(backendUrl)
  const cookie = [body.dt ? `dt=${body.dt}` : '', body.st ? `st=${body.st}` : '']
    .filter(Boolean)
    .join('; ')
  // backendUrl is trusted deployment configuration and is normalized before use.
  const response = await fetch(sessionUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...buildWorkerSecretHeader(),
      ...buildWebClientInfoHeaders(),
      ...backendOriginHeaders,
      ...forwardedIpHeaders,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) return null

  const data = (await response.json()) as { session?: ProxySessionResponse }
  const session = data.session
  if (
    session &&
    typeof session.dte === 'number' &&
    typeof session.ste === 'number' &&
    typeof session.secure === 'boolean'
  ) {
    return session
  }
  return null
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
