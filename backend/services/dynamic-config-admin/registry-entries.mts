import { relationLimitsRegistryEntry } from './registry-relation-limits-entry.mts'
import { sessionLimitsRegistryEntry } from './registry-session-limits-entry.mts'
import { landingPageLimitsRegistryEntry } from './registry-landing-page-limits.mts'
import { hackerNewsRegistryEntries } from './registry-hacker-news-entry.mts'
import {
  pagedDispatchRegistryEntry,
  membershipVerificationQueueRegistryEntry,
  membershipPurchaseCollisionQueueRegistryEntry,
} from './registry-paged-dispatch-entry.mts'
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
import { orderDynamicConfigRegistryEntries } from './registry-order.mts'

const unorderedRegistryEntries = [
  sessionLimitsRegistryEntry,
  relationLimitsRegistryEntry,
  landingPageLimitsRegistryEntry,
  ...hackerNewsRegistryEntries,
  pagedDispatchRegistryEntry,
  membershipVerificationQueueRegistryEntry,
  membershipPurchaseCollisionQueueRegistryEntry,
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

export const dynamicConfigRegistryEntries = orderDynamicConfigRegistryEntries(
  unorderedRegistryEntries,
  REGISTRY_ORDER,
) satisfies DynamicConfigRegistryEntry[]
