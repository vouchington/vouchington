import { cookies, headers as getHeaders } from 'next/headers'
import type { ServerHeaderContext } from '@vouchington/api-client'
import { safeFeatureFlagCookiePart } from '@/lib/feature-flags/shared'
import { buildWorkerSecretHeader } from '../worker-secret'
import { buildWebClientInfoHeaders, withoutPrivateWorkerHeaders } from './client-info'

type HeaderRecord = Record<string, string>

/**
 * Injected after the caller's headers, so client identity, Worker secret, trusted client IPs and
 * forwarded cookies cannot be overridden per call. A caller-supplied cookie or request id wins.
 */
export async function resolveServerHeaders({
  headers,
}: ServerHeaderContext): Promise<HeaderRecord> {
  const [cookieHeader, requestIdHeader, forwardedIpHeaders] = await Promise.all([
    hasHeader(headers, 'cookie') ? {} : buildCookieHeader(),
    hasHeader(headers, 'x-request-id') ? {} : buildRequestIdHeader(),
    buildForwardedIpHeaders(),
  ])
  return {
    ...requestIdHeader,
    ...forwardedIpHeaders,
    ...buildWebClientInfoHeaders(),
    ...buildWorkerSecretHeader(),
    ...cookieHeader,
  }
}

/** Fetch that never forwards caller-supplied private Worker signals. */
export const fetchWithoutPrivateWorkerHeaders: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: withoutPrivateWorkerHeaders((init?.headers ?? {}) as HeaderRecord),
  })

async function buildCookieHeader(): Promise<HeaderRecord> {
  try {
    const cookieStore = await cookies()
    const dt = cookieStore.get('dt')
    const st = cookieStore.get('st')
    const ffPart = safeFeatureFlagCookiePart(cookieStore.get('ff')?.value)
    const cookieParts: string[] = []

    if (dt?.value) cookieParts.push(`dt=${dt.value}`)
    if (st?.value) cookieParts.push(`st=${st.value}`)
    if (ffPart) cookieParts.push(ffPart)

    return cookieParts.length === 0 ? {} : { Cookie: cookieParts.join('; ') }
  } catch {
    return {}
  }
}

async function buildRequestIdHeader(): Promise<HeaderRecord> {
  try {
    const id = (await getHeaders()).get('x-request-id')
    return id ? { 'x-request-id': id } : {}
  } catch {
    return {}
  }
}

async function buildForwardedIpHeaders(): Promise<HeaderRecord> {
  try {
    const headers = await getHeaders()
    const userAgent = headers.get('user-agent')
    const forwardedFor = headers.get('x-forwarded-for')
    const connectingIp = headers.get('cf-connecting-ip')
    return {
      ...(userAgent ? { 'user-agent': userAgent } : {}),
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      ...(connectingIp ? { 'cf-connecting-ip': connectingIp } : {}),
    }
  } catch {
    return {}
  }
}

function hasHeader(headers: HeaderRecord, name: string): boolean {
  return Object.keys(headers).some(headerName => headerName.toLowerCase() === name)
}
