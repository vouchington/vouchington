import { aiUsageDynamicConfigRegistryEntries } from './registry-ai-usage-entries.mts'
import { coreDynamicConfigRegistryEntries } from './registry-core-entries.mts'
import { externalProxyDynamicConfigRegistryEntries } from './registry-external-proxy-entries.mts'
import { featureFlagDynamicConfigRegistryEntries } from './registry-feature-flag-entries.mts'
import { operationalDynamicConfigRegistryEntries } from './registry-operational-entries.mts'
import { policyDynamicConfigRegistryEntries } from './registry-policy-entries.mts'
import { tagLimitsDynamicConfigRegistryEntries } from './registry-tag-limits-entries.mts'
import type { DynamicConfigRegistryEntry } from './types.mts'

const REGISTRY_ORDER = [
  'feature-flags',
  'membership-billing',
  'request-client-info',
  'vote-weight-config',
  'recaptcha-config',
  'turnstile-config',
  'post-content-limits-config',
  'post-related-url-display-config',
  'rate-limit-thresholds',
  'route-rate-limit-config',
  'contribution-rate-limits',
  'bloom-filter-config',
  'rss-feed-discoverability-config',
  'moderation-config',
  'bedrock-embeddings-batch-config',
  'rss-feed-crawl-config',
  'user-import-export-config',
  'web-risk-config',
  'moderation-ai-config',
  'moderation-ai-dispatch-config',
  'agent-response-quotas',
  'openai-spend-cap',
  'manual-tag-limits',
  'autotagger-paid-limits',
  'kagi-smallweb-config',
  'app-attestation-config',
  'activitypub-inbox',
  'oauth-authorization-broker',
  'api-egress-proxy',
] as const

const unorderedRegistryEntries = [
  ...featureFlagDynamicConfigRegistryEntries,
  ...coreDynamicConfigRegistryEntries,
  ...policyDynamicConfigRegistryEntries,
  ...operationalDynamicConfigRegistryEntries,
  ...externalProxyDynamicConfigRegistryEntries,
  ...tagLimitsDynamicConfigRegistryEntries,
  ...aiUsageDynamicConfigRegistryEntries,
] satisfies DynamicConfigRegistryEntry[]

assertRegistryOrderIncludesEntries(unorderedRegistryEntries, REGISTRY_ORDER)

const entriesByNamespace = new Map(unorderedRegistryEntries.map(entry => [entry.namespace, entry]))

export const dynamicConfigRegistryEntries = REGISTRY_ORDER.map(namespace =>
  requireRegistryEntry(namespace),
) satisfies DynamicConfigRegistryEntry[]

export function assertRegistryOrderIncludesEntries(
  entries: readonly Pick<DynamicConfigRegistryEntry, 'namespace'>[],
  registryOrder: readonly string[],
): void {
  const orderedNamespaces = new Set(registryOrder)
  const omittedNamespaces: string[] = []

  for (const entry of entries) {
    if (!orderedNamespaces.has(entry.namespace)) omittedNamespaces.push(entry.namespace)
  }

  if (omittedNamespaces.length > 0) {
    throw new Error(
      `Dynamic config registry entries missing from REGISTRY_ORDER: ${omittedNamespaces.join(', ')}`,
    )
  }
}

function requireRegistryEntry(namespace: string): DynamicConfigRegistryEntry {
  const entry = entriesByNamespace.get(namespace)
  if (!entry) throw new Error(`Missing dynamic config registry entry for ${namespace}`)
  return entry
}
