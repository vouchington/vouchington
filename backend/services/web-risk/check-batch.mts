import createHttpError, { isHttpError } from 'http-errors'
import onError from '@modules/on-error'
import { getDomain } from 'tldts'
import {
  getHostnamePolicies,
  getHostnamePoliciesFromLocal,
} from '@services/urls-domains-blacklist/domains'
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
  localPolicies?: PrecomputedHostnamePolicies
  policies?: PrecomputedHostnamePolicies
  signal?: AbortSignal
  /** Read blocklist rows directly. A stale Bloom negative must not admit a blocked URL. */
  authoritative?: boolean
  /** Record each blocked URL and keep screening the rest of the batch. */
  blockedUrls?: Set<string>
}

const NO_PROVIDER_GATE: ProviderGate = { cleanCached: false, coolingDown: false }
const COOLING_PROVIDER_GATE: ProviderGate = { cleanCached: false, coolingDown: true }

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

/** Applies one URL's policy and cache gate. True means this call failed or set the provider cooldown. */
export async function decideWebRiskUrl(
  state: WebRiskState,
  parsed: URL,
  policy: HostnamePolicy,
  gate: ProviderGate,
  options: WebRiskCheckOptions = {},
): Promise<boolean> {
  if (policy.is_blocked) {
    throw createHttpError(400, `Domain is blocked: ${parsed.hostname}`)
  }
  if (!isWebRiskEnabled() || !hasWebRiskApiKey()) return false
  if (policy.should_skip_web_risk) return false
  if (gate.cleanCached || gate.coolingDown) return false
  if (await state.isLocallyRateLimited()) return false

  let threat: WebRiskThreat | null
  try {
    threat = await checkWebRiskUrl(parsed, state, options.signal)
  } catch (err) {
    if (options.signal?.aborted) throw err
    if (err instanceof WebRiskRateLimitError) {
      onError(err)
      return true
    }
    await state.setProviderCooldown(SHORT_FAILURE_COOLDOWN_SECONDS)
    onError(err instanceof Error ? err : new Error(String(err)))
    return true
  }

  if (!threat) {
    await state.cacheCleanVerdict(parsed)
    return false
  }

  const blockedDomain = getRegistrableDomain(parsed.hostname)
  const blockPolicy = await getLocalHostnamePolicy(blockedDomain)
  if (blockPolicy.should_skip_web_risk) return false

  await blockWebRiskDomain(blockedDomain, parsed.toString(), threat)
  throw createHttpError(400, `Domain is blocked: ${blockedDomain}`)
}

/**
 * One policy read and one Valkey batch for every URL. The Lookup API accepts one `uri` per call,
 * so each uncached URL still makes its own provider request after its own conditional charge.
 * After one call in this batch fails or sets the cooldown, the rest are cooled down in memory.
 */
export async function assertUrlsAllowedByWebRiskWithState(
  state: WebRiskState,
  urls: readonly string[],
  options: WebRiskCheckOptions = {},
): Promise<void> {
  const parsed: Array<{ original: string; url: URL }> = []
  const seen = new Set<string>()
  for (const url of urls) {
    if (seen.has(url)) continue
    seen.add(url)
    const value = parseWebRiskUrl(url)
    if (value) parsed.push({ original: url, url: value })
  }
  if (parsed.length === 0) return
  const hostnames = parsed.map(item => item.url.hostname)
  const policyOptions = options.authoritative ? { readOnly: false as const } : {}
  const policies =
    options.policies ??
    (options.localPolicies
      ? await getHostnamePoliciesFromLocal(hostnames, options.localPolicies, policyOptions)
      : await getHostnamePolicies(hostnames, policyOptions))
  const providerActive = isWebRiskEnabled() && hasWebRiskApiKey()
  const decided = parsed.map(item => {
    const policy =
      policies.get(normalizeHostnameForPolicy(item.url.hostname)) ?? EMPTY_HOSTNAME_POLICY
    return { ...item, policy }
  })
  const needingGate = decided.filter(
    item => providerActive && !item.policy.is_blocked && !item.policy.should_skip_web_risk,
  )
  const gates = await state.readProviderGates(needingGate.map(item => item.url))
  const gateByUrl = new Map(needingGate.map((item, index) => [item.url.toString(), gates[index]!]))
  let providerCoolingDown = false
  for (const item of decided) {
    try {
      // oxlint-disable no-await-in-loop -- the rate-limit charge and provider cooldown are ordered per URL
      // no-mistakes-disable-next-line query-reached-per-item: uris:search takes one uri; this URL's charge, cache write, and block depend on that response. A projection prefix that reaches this loop is at most relationLimitsMaxValues.post_related_url and runs before the admission transaction opens
      const providerFailed = await decideWebRiskUrl(
        state,
        item.url,
        item.policy,
        providerCoolingDown
          ? COOLING_PROVIDER_GATE
          : (gateByUrl.get(item.url.toString()) ?? NO_PROVIDER_GATE),
        options,
      )
      if (providerFailed) providerCoolingDown = true
      // oxlint-enable no-await-in-loop
    } catch (err) {
      if (options.blockedUrls && isHttpError(err) && err.status === 400) {
        options.blockedUrls.add(item.original)
        continue
      }
      throw err
    }
  }
}

/** Screens every URL. A blocked URL is recorded and does not stop the rest of the batch. */
export async function blockedUrlsFromWebRiskScreenWithState(
  state: WebRiskState,
  urls: readonly string[],
): Promise<Set<string>> {
  const blockedUrls = new Set<string>()
  await assertUrlsAllowedByWebRiskWithState(state, urls, { blockedUrls, authoritative: true })
  return blockedUrls
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
