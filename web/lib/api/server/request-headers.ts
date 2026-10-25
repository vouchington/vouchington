import { cookies, headers as getHeaders } from 'next/headers'
import type { ServerHeaderContext } from '@vouchington/api-client'
import { VOUCHA_BOT_SCORE_HEADER } from '@ts-shared/utils/bot-challenge'
import { safeFeatureFlagCookiePart } from '@/lib/feature-flags/shared'
import { buildWorkerSecretHeader } from '../worker-secret'
import { buildWebClientInfoHeaders } from './client-info'

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

/** Fetch that never forwards the Cloudflare Worker's private bot score from a caller. */
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
    const forwardedFor = headers.get('x-forwarded-for')
    const connectingIp = headers.get('cf-connecting-ip')
    return {
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

function withoutPrivateWorkerHeaders(headers: HeaderRecord): HeaderRecord {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => name.toLowerCase() !== VOUCHA_BOT_SCORE_HEADER),
  )
}
