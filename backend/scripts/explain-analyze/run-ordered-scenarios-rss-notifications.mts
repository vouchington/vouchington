import { runRssFeedDedupCapacity } from './run-scenarios/rss-feed-dedup-capacity.mts'
import { runRssCrawlFetchLookupCapacity } from './run-scenarios/rss-crawl-fetch-lookup-capacity.mts'
import { runRssFeedDiscoverabilityCapacity } from './run-scenarios/rss-feed-discoverability-capacity.mts'
import { runRssIngestExistingItemsCapacity } from './run-scenarios/rss-ingest-existing-items-capacity.mts'
import { runRssTrendingCapacity } from './run-scenarios/rss-trending-capacity.mts'
import { runNotificationRssSnapshotCapacity } from './run-scenarios/notification-rss-snapshot-capacity.mts'
import { runNotificationPostSnapshotCapacity } from './run-scenarios/notification-post-snapshot-capacity.mts'
import { runNotificationRedirectCapacity } from './run-scenarios/notification-redirect-capacity.mts'
import { runTopicMergeRelationFlagCapacity } from './run-scenarios/topic-merge-relation-flag-capacity.mts'

export const RSS_NOTIFICATIONS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runRssFeedDedupCapacity,
  runRssCrawlFetchLookupCapacity,
  runRssFeedDiscoverabilityCapacity,
  runRssIngestExistingItemsCapacity,
  runRssTrendingCapacity,
  runNotificationRssSnapshotCapacity,
  runNotificationPostSnapshotCapacity,
  runNotificationRedirectCapacity,
  runTopicMergeRelationFlagCapacity,
]
