import { pagedDispatchRegistryEntry } from './registry-paged-dispatch-entry.mts'
import { REGISTRY_ORDER } from '@voucha/config/dynamic-config-registry-order'
import { paginationRegistryEntries } from './registry-pagination-entries.mts'
import { backgroundWorkRegistryEntries9 } from './registry-background-work-entries-9.mts'
import { backgroundWorkRegistryEntries8 } from './registry-background-work-entries-8.mts'
import { backgroundWorkRegistryEntries7 } from './registry-background-work-entries-7.mts'
import { backgroundWorkRegistryEntries6 } from './registry-background-work-entries-6.mts'
import { backgroundWorkRegistryEntries5 } from './registry-background-work-entries-5.mts'
import { backgroundWorkEntries1 } from './registry-background-work-entries-1.mts'
import { backgroundWorkEntries2 } from './registry-background-work-entries-2.mts'
import { backgroundWorkEntries3 } from './registry-background-work-entries-3.mts'
import { backgroundWorkEntries4 } from './registry-background-work-entries-4.mts'
import { streamDynamicConfigRegistryEntries } from './registry-stream-entries.mts'
import { workDynamicConfigRegistryEntries } from './registry-work-entries.mts'
import { aiUsageDynamicConfigRegistryEntries } from './registry-ai-usage-entries.mts'
import { coreDynamicConfigRegistryEntries } from './registry-core-entries.mts'
import { botChallengeRegistryEntry } from './registry-bot-challenge-entry.mts'
import { externalProxyDynamicConfigRegistryEntries } from './registry-external-proxy-entries.mts'
import { featureFlagDynamicConfigRegistryEntries } from './registry-feature-flag-entries.mts'
import { operationalDynamicConfigRegistryEntries } from './registry-operational-entries.mts'
import { policyDynamicConfigRegistryEntries } from './registry-policy-entries.mts'
import { tagLimitsDynamicConfigRegistryEntries } from './registry-tag-limits-entries.mts'
import type { DynamicConfigRegistryEntry } from '@vouchington/dynamic-config'

const unorderedRegistryEntries = [
  pagedDispatchRegistryEntry,
  ...paginationRegistryEntries,
  ...backgroundWorkEntries1,
  ...backgroundWorkEntries2,
  ...backgroundWorkEntries3,
  ...backgroundWorkEntries4,
  ...Object.values(backgroundWorkRegistryEntries5),
  ...Object.values(backgroundWorkRegistryEntries6),
  ...Object.values(backgroundWorkRegistryEntries7),
  ...Object.values(backgroundWorkRegistryEntries8),
  ...Object.values(backgroundWorkRegistryEntries9),

  ...workDynamicConfigRegistryEntries,
  ...streamDynamicConfigRegistryEntries,
  ...featureFlagDynamicConfigRegistryEntries,
  ...coreDynamicConfigRegistryEntries,
  botChallengeRegistryEntry,
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
