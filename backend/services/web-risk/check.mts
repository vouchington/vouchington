import createHttpError from 'http-errors'
import onError from '@modules/on-error'
import { getExternalRequestDispatcher } from '@modules/utils/http-dispatchers'
import { isPublicHostname } from '@modules/utils/urls'
import { fetch } from 'undici'
import { getDomain } from 'tldts'
import { isUrlBlocked } from '@services/urls-domains-blacklist'
import { getHostnamePolicy } from '@services/urls-hostnames/policies'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { blockHostname } from '@services/hostname-blocking/block-hostname'
import { getSystemUserByUsername, upsertSystemUser } from '@services/users/system-users'
import {
  cacheCleanVerdict,
  hasCleanCachedVerdict,
  isLocallyRateLimited,
  isProviderCoolingDown,
  setProviderCooldown,
  setProviderCooldownFromResponse,
} from './state.mts'
import { isWebRiskEnabled } from './config.mts'

const WEB_RISK_LOOKUP_URL = 'https://webrisk.googleapis.com/v1/uris:search'
const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'SOCIAL_ENGINEERING_EXTENDED_COVERAGE',
] as const
const SHORT_FAILURE_COOLDOWN_SECONDS = 10

export type WebRiskThreat = {
  threatTypes: string[]
  expireTime: string | null
}

export class WebRiskRateLimitError extends Error {
  override name = 'WebRiskRateLimitError'
}

export async function assertUrlAllowedByWebRisk(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
  if (!isPublicHostname(parsed.hostname)) return

  if (await isUrlBlocked(parsed.hostname)) {
    throw createHttpError(400, `Domain is blocked: ${parsed.hostname}`)
  }

  if (!isWebRiskEnabled()) return
  if (!hasWebRiskApiKey()) return

  const policy = await getHostnamePolicy(parsed.hostname)
  if (policy.skip_web_risk) return
  if (await hasCleanCachedVerdict(parsed)) return
  if (await isProviderCoolingDown()) return
  if (await isLocallyRateLimited()) return

  let threat: WebRiskThreat | null
  try {
    threat = await checkWebRiskUrl(parsed)
  } catch (error) {
    if (error instanceof WebRiskRateLimitError) {
      onError(error)
      return
    }
    await setProviderCooldown(SHORT_FAILURE_COOLDOWN_SECONDS)
    onError(error instanceof Error ? error : new Error(String(error)))
    return
  }

  if (!threat) {
    await cacheCleanVerdict(parsed)
    return
  }

  const blockedDomain = getRegistrableDomain(parsed.hostname)
  const blockPolicy = await getHostnamePolicy(blockedDomain)
  if (blockPolicy.skip_web_risk) return

  await blockWebRiskDomain(blockedDomain, parsed.toString(), threat)
  throw createHttpError(400, `Domain is blocked: ${blockedDomain}`)
}

/* no-mistakes: integration=google-web-risk */
export async function checkWebRiskUrl(url: URL): Promise<WebRiskThreat | null> {
  const apiKey = getWebRiskApiKey()
  if (!apiKey) throw new Error('Google Web Risk API key is not configured')

  const requestUrl = new URL(WEB_RISK_LOOKUP_URL)
  requestUrl.searchParams.set('uri', url.toString())
  requestUrl.searchParams.set('key', apiKey)
  for (const threatType of THREAT_TYPES) {
    requestUrl.searchParams.append('threatTypes', threatType)
  }

  const response = await fetch(requestUrl, {
    dispatcher: getExternalRequestDispatcher(),
    signal: AbortSignal.timeout(5000),
  }).catch(error => {
    throw new Error('Google Web Risk lookup request failed', { cause: error })
  })

  if (response.status === 429 || response.status === 403) {
    // Ambient and package `Response` declarations have version-skewed types but describe the same
    // Undici-backed WHATWG runtime object (see http-dispatchers.mts), so this cast has no
    // behavioral effect. Needed for programs that also load the "dom" lib (playwright,
    // integration-tests), where the ambient global `Response` resolves to lib.dom's incompatible
    // type instead of undici's — the two types don't overlap enough for a direct assertion.
    await setProviderCooldownFromResponse(response as unknown as Response)
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
  } catch (error) {
    throw new Error('Google Web Risk lookup returned invalid JSON', { cause: error })
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

async function blockWebRiskDomain(
  hostname: string,
  checkedUrl: string,
  threat: WebRiskThreat,
): Promise<void> {
  const systemUser = (await getSystemUserByUsername('system')) ?? (await upsertSystemUser('system'))
  const hostnameMap = await upsertUrlHostnames(systemUser.id, [hostname])
  const hostnameId = hostnameMap.get(hostname)
  if (!hostnameId) throw new Error(`Failed to upsert Web Risk hostname ${hostname}`)
  await blockHostname(systemUser.id, hostnameId, {
    blockedSource: 'google_web_risk',
    penalizeCreators: false,
    webRiskCheckedUrl: checkedUrl,
    webRiskThreatTypes: threat.threatTypes,
    webRiskExpireAt: threat.expireTime,
  })
}

function getWebRiskApiKey(): string | undefined {
  return process.env.GOOGLE_WEB_RISK_API_KEY?.trim() || undefined
}

function hasWebRiskApiKey(): boolean {
  return Boolean(getWebRiskApiKey())
}

function getRegistrableDomain(hostname: string): string {
  return (
    getDomain(hostname, { allowPrivateDomains: true }) ?? hostname.toLowerCase().replace(/\.+$/, '')
  )
}
