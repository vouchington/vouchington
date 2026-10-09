import createHttpError from 'http-errors'
import onError from '@modules/on-error'
import { isPublicHostname } from '@modules/utils/urls'
import { getDomain } from 'tldts'
import { getHostnamePolicies, getHostnamePolicy } from '@services/urls-domains-blacklist/domains'
import {
  getLocalHostnamePolicy,
  normalizeHostnameForPolicy,
  type HostnamePolicy,
} from '@services/urls-hostnames/policies'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { blockHostname } from '@services/hostname-blocking/block-hostname'
import { getSystemUserByUsername, upsertSystemUser } from '@services/users/system-users'
import { createWebRiskState, type ProviderGate, type WebRiskState } from './state.mts'
import { isWebRiskEnabled } from './config.mts'
import {
  checkWebRiskUrl,
  hasWebRiskApiKey,
  SHORT_FAILURE_COOLDOWN_SECONDS,
  WebRiskRateLimitError,
  type WebRiskThreat,
} from './provider.mts'

const productionState = createWebRiskState()
export const assertUrlAllowedByWebRisk = createWebRiskChecker(productionState)

/** Hostname policies already read for a batch of URLs, keyed by `normalizeHostnameForPolicy`. */
type PrecomputedHostnamePolicies = ReadonlyMap<string, HostnamePolicy>

type WebRiskCheckOptions = { policies?: PrecomputedHostnamePolicies }

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

/**
 * Binds the real preflight/provider pipeline to one persistent Web Risk state owner.
 *
 * Serial depth per URL: one concurrent step (hostname policy read, plus the clean-verdict and
 * cooldown pipeline when the provider is active), then the local rate-limit charge, then the
 * provider call. Pass `policies` to skip the policy read for hostnames already resolved.
 */
export function createWebRiskChecker(state: WebRiskState) {
  return async function assertUrlAllowedByWebRisk(
    url: string,
    options: WebRiskCheckOptions = {},
  ): Promise<void> {
    const parsed = parseWebRiskUrl(url)
    if (!parsed) return

    const providerActive = isWebRiskEnabled() && hasWebRiskApiKey()
    const known = options.policies?.get(normalizeHostnameForPolicy(parsed.hostname))
    const needsGate = providerActive && !known?.is_blocked && !known?.should_skip_web_risk
    // Settled together so a blocked or skipped URL never surfaces a Valkey error from the gate.
    const [policyResult, gateResult] = await Promise.allSettled([
      known ?? getHostnamePolicy(parsed.hostname),
      needsGate ? state.readProviderGate(parsed) : NO_PROVIDER_GATE,
    ])
    if (policyResult.status === 'rejected') throw policyResult.reason
    const policy = policyResult.value

    if (policy.is_blocked) {
      throw createHttpError(400, `Domain is blocked: ${parsed.hostname}`)
    }

    if (!providerActive) return
    if (policy.should_skip_web_risk) return
    if (gateResult.status === 'rejected') throw gateResult.reason
    if (gateResult.value.cleanCached || gateResult.value.coolingDown) return
    if (await state.isLocallyRateLimited()) return

    let threat: WebRiskThreat | null
    try {
      threat = await checkWebRiskUrl(parsed, state)
    } catch (err) {
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
}

/**
 * Checks many URLs against one batched hostname policy read, so N URLs cost one policy query
 * instead of N. Pass `policies` when the caller already read them.
 */
export async function assertUrlsAllowedByWebRisk(
  urls: string[],
  options: WebRiskCheckOptions = {},
): Promise<void> {
  const uniqueUrls = [...new Set(urls)]
  const policies = options.policies ?? (await readPolicies(uniqueUrls))
  await Promise.all(uniqueUrls.map(url => assertUrlAllowedByWebRisk(url, { policies })))
}

async function readPolicies(urls: string[]): Promise<PrecomputedHostnamePolicies> {
  const hostnames = urls.flatMap(url => parseWebRiskUrl(url)?.hostname ?? [])
  return getHostnamePolicies(hostnames)
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
