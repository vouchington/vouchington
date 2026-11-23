import { getExternalFetch } from '@modules/utils/http'
import { type WebRiskLookupResult, lookupWebRiskUri } from '@vouchington/utils/web-risk'

export const SHORT_FAILURE_COOLDOWN_SECONDS = 10

/* no-mistakes: integration=google-web-risk */
export function checkWebRiskUrl(
  url: URL,
  apiKey: string,
  signal?: AbortSignal,
): Promise<WebRiskLookupResult> {
  return lookupWebRiskUri({ fetch: getExternalFetch(), apiKey, uri: url.toString(), signal })
}

export function getWebRiskApiKey(): string | undefined {
  return process.env.GOOGLE_WEB_RISK_API_KEY?.trim() || undefined
}

export function hasWebRiskApiKey(): boolean {
  return Boolean(getWebRiskApiKey())
}
