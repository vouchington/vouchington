import { runNotificationUnreadCapacityScenario } from './run-scenarios/notification-unread-capacity.mts'
import { runAggregateExistenceScenarios } from './run-scenarios/aggregate-existence.mts'
import { runAiUsageTotalsScenarios } from './run-scenarios/ai-usage-totals.mts'
import { runPostImageWriteScenarios } from './run-scenarios/post-image-writes.mts'
import { runConversationMessageCapacityScenario } from './run-scenarios/conversation-message-capacity.mts'
import {
  runNotificationInboxCapacityScenario,
  runMarkNotificationInboxCapacityScenario,
} from './run-scenarios/notification-inbox-capacity.mts'
import { runTopicClaimCapacityScenarios } from './run-scenarios/topic-claim-capacity.mts'
import { runRssFeedCrawlCapacityScenario } from './run-scenarios/rss-feed-crawl-capacity.mts'
import { runAdminReviewAndGuestReadScenarios } from './run-scenarios/admin-review-and-guest-reads.mts'
import { runMessageNotificationWriteCapacity } from './run-scenarios/message-notification-write-capacity.mts'
import { runRelatedPostUrlCapacityScenario } from './run-scenarios/related-post-url-capacity.mts'
import { runHackerNewsPostFlagPages } from './run-scenarios/hacker-news-post-flag-pages.mts'
import { runPrivatePostCollectionsCapacityScenarios } from './run-scenarios/private-post-collections-capacity.mts'
import { runPostCreatedRecoveryCapacity } from './run-scenarios/post-created-recovery-capacity.mts'
import { runModeratorWorkloadCapacity } from './run-scenarios/moderator-workload-capacity.mts'

export const AFTER_NOTIFICATIONS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  // These fixtures change crawler-table statistics; keep them after every existing plan.
  runAggregateExistenceScenarios,
  // Keep the extra communities out of ordinary search and ranking plan captures.
  runAiUsageTotalsScenarios,
  runModeratorWorkloadCapacity,
  runPostImageWriteScenarios,
  runPrivatePostCollectionsCapacityScenarios,
  runPostCreatedRecoveryCapacity,
  runConversationMessageCapacityScenario,
  runNotificationInboxCapacityScenario,
  runMarkNotificationInboxCapacityScenario,
  runTopicClaimCapacityScenarios,
  runRssFeedCrawlCapacityScenario,
  runAdminReviewAndGuestReadScenarios,
  runMessageNotificationWriteCapacity,
  runRelatedPostUrlCapacityScenario,
  runHackerNewsPostFlagPages,
]

export const NOTIFICATION_UNREAD_RUNNERS = [runNotificationUnreadCapacityScenario] as const
