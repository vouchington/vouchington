import createHttpError from 'http-errors'
import onError from '@modules/on-error'
import { getDomain } from 'tldts'
import { getHostnamePolicies } from '@services/urls-domains-blacklist/domains'
import {
  EMPTY_HOSTNAME_POLICY,
  getLocalHostnamePolicy,
  normalizeHostnameForPolicy,
  type HostnamePolicy,
} from '@services/urls-hostnames/policies'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { blockHostname } from '@services/hostname-blocking/block-hostname'
import { getSystemUserByUsername, upsertSystemUser } from '@services/users/system-users'
import { isPublicHostname } from '@modules/utils/urls'
import type { ProviderGate, WebRiskState } from './state.mts'
import { isWebRiskEnabled } from './config.mts'
import {
  checkWebRiskUrl,
  hasWebRiskApiKey,
  SHORT_FAILURE_COOLDOWN_SECONDS,
  WebRiskRateLimitError,
  type WebRiskThreat,
} from './provider.mts'

type PrecomputedHostnamePolicies = ReadonlyMap<string, HostnamePolicy>

type WebRiskCheckOptions = {
  policies?: PrecomputedHostnamePolicies
  signal?: AbortSignal
}

const NO_PROVIDER_GATE: ProviderGate = { cleanCached: false, coolingDown: false }

/** Parses only the public http(s) URLs this service checks; anything else is out of scope. */
export function parseWebRiskUrl(url: string): URL | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!isPublicHostname(parsed.hostname)) return null
  return parsed
}

/** Applies one URL's already-loaded policy and cache gate. The local rate-limit charge stays last. */
export async function decideWebRiskUrl(
  state: WebRiskState,
  parsed: URL,
  policy: HostnamePolicy,
  gate: ProviderGate,
  options: WebRiskCheckOptions = {},
): Promise<void> {
  if (policy.is_blocked) {
    throw createHttpError(400, `Domain is blocked: ${parsed.hostname}`)
  }
  if (!isWebRiskEnabled() || !hasWebRiskApiKey()) return
  if (policy.should_skip_web_risk) return
  if (gate.cleanCached || gate.coolingDown) return
  if (await state.isLocallyRateLimited()) return

  let threat: WebRiskThreat | null
  try {
    threat = await checkWebRiskUrl(parsed, state, options.signal)
  } catch (err) {
    if (options.signal?.aborted) throw err
    if (err instanceof WebRiskRateLimitError) {
      onError(err)
      return
    }
    await state.setProviderCooldown(SHORT_FAILURE_COOLDOWN_SECONDS)
    onError(err instanceof Error ? err : new Error(String(err)))
    return
  }

  if (!threat) {
    await state.cacheCleanVerdict(parsed)
    return
  }

  const blockedDomain = getRegistrableDomain(parsed.hostname)
  const blockPolicy = await getLocalHostnamePolicy(blockedDomain)
  if (blockPolicy.should_skip_web_risk) return

  await blockWebRiskDomain(blockedDomain, parsed.toString(), threat)
  throw createHttpError(400, `Domain is blocked: ${blockedDomain}`)
}

/**
 * One policy read and one Valkey batch for every URL. The Lookup API accepts one `uri` per call,
 * so each uncached URL still makes its own provider request after its own conditional charge.
 */
export async function assertUrlsAllowedByWebRiskWithState(
  state: WebRiskState,
  urls: readonly string[],
  options: WebRiskCheckOptions = {},
): Promise<void> {
  const parsed = [...new Set(urls)].flatMap(url => {
    const value = parseWebRiskUrl(url)
    return value ? [value] : []
  })
  if (parsed.length === 0) return
  const policies = options.policies ?? (await getHostnamePolicies(parsed.map(url => url.hostname)))
  const providerActive = isWebRiskEnabled() && hasWebRiskApiKey()
  const decided = parsed.map(url => {
    const policy = policies.get(normalizeHostnameForPolicy(url.hostname)) ?? EMPTY_HOSTNAME_POLICY
    return { url, policy }
  })
  const needingGate = decided.filter(
    item => providerActive && !item.policy.is_blocked && !item.policy.should_skip_web_risk,
  )
  const gates = await state.readProviderGates(needingGate.map(item => item.url))
  const gateByUrl = new Map(needingGate.map((item, index) => [item.url.toString(), gates[index]!]))
  for (const item of decided) {
    // oxlint-disable no-await-in-loop -- the rate-limit charge and provider cooldown are ordered per URL
    // no-mistakes-disable-next-line query-reached-per-item: uris:search takes one uri; this URL's charge, cache write, and block depend on that response
    await decideWebRiskUrl(
      state,
      item.url,
      item.policy,
      gateByUrl.get(item.url.toString()) ?? NO_PROVIDER_GATE,
      options,
    )
    // oxlint-enable no-await-in-loop
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

function getRegistrableDomain(hostname: string): string {
  return (
    getDomain(hostname, { allowPrivateDomains: true }) ?? hostname.toLowerCase().replace(/\.+$/, '')
  )
}
