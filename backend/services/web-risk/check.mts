import { getHostnamePolicy } from '@services/urls-domains-blacklist/domains'
import { normalizeHostnameForPolicy, type HostnamePolicy } from '@services/urls-hostnames/policies'
import { createWebRiskState, type ProviderGate, type WebRiskState } from './state.mts'
import { isWebRiskEnabled } from './config.mts'
import { hasWebRiskApiKey } from './provider.mts'
import {
  assertUrlsAllowedByWebRiskWithState,
  decideWebRiskUrl,
  parseWebRiskUrl,
} from './check-batch.mts'

const productionState = createWebRiskState()
export const assertUrlAllowedByWebRisk = createWebRiskChecker(productionState)
export { parseWebRiskUrl }

/** Hostname policies already read for a batch of URLs, keyed by `normalizeHostnameForPolicy`. */
type PrecomputedHostnamePolicies = ReadonlyMap<string, HostnamePolicy>

type WebRiskCheckOptions = {
  policies?: PrecomputedHostnamePolicies
  /** Aborts the provider lookup. An abort is thrown, never treated as a provider failure. */
  signal?: AbortSignal
}

const NO_PROVIDER_GATE: ProviderGate = { cleanCached: false, coolingDown: false }

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
    if (policy.is_blocked || !providerActive || policy.should_skip_web_risk) {
      await decideWebRiskUrl(state, parsed, policy, NO_PROVIDER_GATE, options)
      return
    }
    if (gateResult.status === 'rejected') throw gateResult.reason
    await decideWebRiskUrl(state, parsed, policy, gateResult.value, options)
  }
}

/**
 * Checks many URLs against one batched hostname policy read, so N URLs cost one policy query
 * instead of N. Pass `policies` when the caller already read them.
 */
export async function assertUrlsAllowedByWebRisk(
  urls: readonly string[],
  options: WebRiskCheckOptions = {},
): Promise<void> {
  await assertUrlsAllowedByWebRiskWithState(productionState, urls, options)
}
