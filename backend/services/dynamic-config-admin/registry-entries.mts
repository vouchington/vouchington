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
  'story-related-items-config',
  'rate-limit-thresholds',
  'route-rate-limit-config',
  'contribution-rate-limits',
  'bloom-filter-config',
  'copyright',
  'rss-feed-discoverability-config',
  'moderation-config',
  'bedrock-embeddings-batch-config',
  'rss-feed-crawl-config',
  'user-import-export-config',
  'data-retention-config',
  'pagination-config',
  'moderation-analytics-work-config',
  'post-clearance-work-config',
  'users-work-config',
  'vote-weight-work-config',
  'crawl-boilerplate-removal-work-config',
  'find-your-friends-work-config',
  'stripe-work-config',
  'recommended-topics-work-config',
  'engagement-emails-work-config',
  'ap-inbox-activities-work-config',
  'user-deletions-work-config',
  'topics-work-config',
  'stories-work-config',
  'remote-actors-work-config',
  'posts-work-config',
  'media-delivery-safety-work-config',
  'entity-relations-work-config',
  'elections-votes-work-config',
  'classifiers-work-config',
  'classifier-runs-work-config',
  'urls-domains-blacklist-work-config',
  'bookmarks-work-config',
  'notifications-work-config',
  'rss-feeds-work-config',
  'rss-feed-items-work-config',
  'post-publication-work-config',
  'ai-usage-work-config',
  'bluesky-follows-work-config',
  'crawl-embeds-work-config',
  'language-detection-work-config',
  'report-integrity-work-config',
  'images-work-config',
  'openai-background-responses-work-config',
  'openai-moderation-work-config',
  'entity-cache-work-config',
  'hostname-blocking-work-config',
  'moderation-reports-work-config',
  'communities-work-config',
  'admin-imports-work-config',
  'follower-distributions-work-config',
  'oauth-facebook-work-config',
  'oauth-github-work-config',
  'oauth-x-work-config',
  'crawl-dispatch-work-config',
  'referral-crawl-dispatch-work-config',
  'referral-unfurl-dispatch-work-config',
  'friends-dispatch-work-config',
  'entity-reconciliation-work-config',
  'api-keys-work-config',
  'account-data-requests-work-config',
  'memberships-work-config',
  'copyright-notices-work-config',
  'web-risk-config',
  'moderation-ai-config',
  'moderation-ai-dispatch-config',
  'ai-spend-cap',
  'manual-tag-limits',
  'autotagger-paid-limits',
  'kagi-smallweb-config',
  'app-attestation-config',
  'activitypub-inbox',
  'oauth-authorization-broker',
  'api-egress-proxy',
] as const

const unorderedRegistryEntries = [
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
