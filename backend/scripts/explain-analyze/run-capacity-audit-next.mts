import { runNotificationRssHydrationCapacity } from './run-scenarios/notification-rss-hydration-capacity.mts'
import { runRssMappedTopicCapacity } from './run-scenarios/rss-mapped-topic-capacity.mts'
import { runRssSourcePublicationBackfillCapacity } from './run-scenarios/rss-source-publication-backfill-capacity.mts'
import { runTopicMergeAliasCapacityScenarios } from './run-scenarios/topic-merge-alias-capacity.mts'

export const CAPACITY_AUDIT_NEXT_RUNNERS = [
  runTopicMergeAliasCapacityScenarios,
  runRssSourcePublicationBackfillCapacity,
  runNotificationRssHydrationCapacity,
  runRssMappedTopicCapacity,
] as const
