import { runRssUnmappedCategoryCapacityScenario } from './run-scenarios/rss-unmapped-category-capacity.mts'
import { runRssLatestCrawlCapacityScenario } from './run-scenarios/rss-latest-crawl-capacity.mts'
import { runRssHackerNewsFlagPagesCapacity } from './run-scenarios/rss-hacker-news-flag-pages-capacity.mts'
import { runRssFeedCollectionHydrationCapacity } from './run-scenarios/rss-feed-collection-hydration-capacity.mts'
import { runRssItemFeedHydrationCapacityScenario } from './run-scenarios/rss-item-feed-hydration-capacity.mts'
import { runRssStorySearchCapacityScenarios } from './run-scenarios/rss-story-search-capacity.mts'
import { runTopicReferenceCapacityScenario } from './run-scenarios/topic-reference-capacity.mts'
import { runTopicMergeParentCapacityScenario } from './run-scenarios/topic-merge-parent-capacity.mts'
import { runNotificationPushRecoveryCapacityScenario } from './run-scenarios/notification-push-recovery-capacity.mts'
import { runWebPushSubscriptionCapacityScenario } from './run-scenarios/web-push-subscription-capacity.mts'
import { runCriticalAlertRecipientCapacityScenario } from './run-scenarios/critical-alert-recipient-capacity.mts'
import { runNotificationRssHydrationCapacity } from './run-scenarios/notification-rss-hydration-capacity.mts'
import { runRssMappedTopicCapacity } from './run-scenarios/rss-mapped-topic-capacity.mts'
import { runRssSourcePublicationBackfillCapacity } from './run-scenarios/rss-source-publication-backfill-capacity.mts'
import { runTopicMergeAliasCapacityScenarios } from './run-scenarios/topic-merge-alias-capacity.mts'

export const CAPACITY_AUDIT_RUNNERS = [
  runRssUnmappedCategoryCapacityScenario,
  runRssLatestCrawlCapacityScenario,
  runRssHackerNewsFlagPagesCapacity,
  runRssFeedCollectionHydrationCapacity,
  runRssItemFeedHydrationCapacityScenario,
  runRssStorySearchCapacityScenarios,
  runTopicReferenceCapacityScenario,
  runTopicMergeParentCapacityScenario,
  runNotificationPushRecoveryCapacityScenario,
  runWebPushSubscriptionCapacityScenario,
  runCriticalAlertRecipientCapacityScenario,
  runTopicMergeAliasCapacityScenarios,
  runRssSourcePublicationBackfillCapacity,
  runNotificationRssHydrationCapacity,
  runRssMappedTopicCapacity,
] as const
