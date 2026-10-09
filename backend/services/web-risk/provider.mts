import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import undici from 'undici'
import type { WebRiskState } from './state.mts'

const WEB_RISK_LOOKUP_URL = 'https://webrisk.googleapis.com/v1/uris:search'
const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'SOCIAL_ENGINEERING_EXTENDED_COVERAGE',
] as const
export const SHORT_FAILURE_COOLDOWN_SECONDS = 10

export type WebRiskThreat = {
  threatTypes: string[]
  expireTime: string | null
}

export class WebRiskRateLimitError extends Error {
  override name = 'WebRiskRateLimitError'
}

/* no-mistakes: integration=google-web-risk */
export async function checkWebRiskUrl(
  url: URL,
  state: WebRiskState,
): Promise<WebRiskThreat | null> {
  const apiKey = getWebRiskApiKey()
  if (!apiKey) throw new Error('Google Web Risk API key is not configured')

  const requestUrl = new URL(WEB_RISK_LOOKUP_URL)
  requestUrl.searchParams.set('uri', url.toString())
  requestUrl.searchParams.set('key', apiKey)
  for (const threatType of THREAT_TYPES) {
    requestUrl.searchParams.append('threatTypes', threatType)
  }

  const response = await undici
    .fetch(requestUrl, {
      dispatcher: getExternalRequestDispatcher(),
      signal: AbortSignal.timeout(5000),
    })
    .catch(err => {
      throw new Error('Google Web Risk lookup request failed', { cause: err })
    })

  if (response.status === 429 || response.status === 403) {
    // Ambient and package `Response` declarations have version-skewed types but describe the same
    // Undici-backed WHATWG runtime object (see http-dispatchers.mts), so this cast has no
    // behavioral effect. Needed for programs that also load the "dom" lib (playwright,
    // integration-tests), where the ambient global `Response` resolves to lib.dom's incompatible
    // type instead of undici's — the two types don't overlap enough for a direct assertion.
    await state.setProviderCooldownFromResponse(response as unknown as Response)
    await response.body?.cancel()
    throw new WebRiskRateLimitError(`Google Web Risk lookup rate limited (HTTP ${response.status})`)
  }
  if (response.status >= 500) {
    await response.body?.cancel()
    throw new Error(`Google Web Risk lookup returned HTTP ${response.status}`)
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Google Web Risk lookup returned HTTP ${response.status}`)
  }

  let data: unknown
  try {
    data = await response.json()
  } catch (err) {
    throw new Error('Google Web Risk lookup returned invalid JSON', { cause: err })
  }
  return parseWebRiskThreat(data)
}

function parseWebRiskThreat(data: unknown): WebRiskThreat | null {
  const threat = ((data ?? {}) as Record<string, unknown>).threat as Record<string, unknown> | null
  if (!threat) return null
  const threatTypes = Array.isArray(threat.threatTypes)
    ? threat.threatTypes.filter((value): value is string => typeof value === 'string')
    : []
  if (threatTypes.length === 0) return null
  return {
    threatTypes,
    expireTime: typeof threat.expireTime === 'string' ? threat.expireTime : null,
  }
}

function getWebRiskApiKey(): string | undefined {
  return process.env.GOOGLE_WEB_RISK_API_KEY?.trim() || undefined
}

export function hasWebRiskApiKey(): boolean {
  return Boolean(getWebRiskApiKey())
}
