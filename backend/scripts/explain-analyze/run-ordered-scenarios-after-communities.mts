import { runConversationListCapacityScenario } from './run-scenarios/conversation-list-capacity.mts'
import { runCommunitySearchCapacityScenario } from './run-scenarios/community-search-capacity.mts'
import { runCommunityMemberMetricPages } from './run-scenarios/community-member-metric-pages.mts'
import { runCommunityMembershipReadCapacityScenarios } from './run-scenarios/community-membership-read-capacity.mts'
import { runModerationReportListCapacity } from './run-scenarios/moderation-report-list-capacity.mts'
import { runCommunityRosterReadCapacityScenario } from './run-scenarios/community-roster-read-capacity.mts'
import { runCommunityHistoryReadScenarios } from './run-scenarios/community-history-reads.mts'
import { runCommunityModerationListCapacityScenarios } from './run-scenarios/community-moderation-list-capacity.mts'
import { runCommunityPublicationCapacityScenarios } from './run-scenarios/community-publication-capacity.mts'
import { runCommunityModerationQueueCapacityScenarios } from './run-scenarios/community-moderation-queue-capacity.mts'

export const AFTER_COMMUNITIES_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runConversationListCapacityScenario,
  runCommunitySearchCapacityScenario,
  runCommunityMemberMetricPages,
  runCommunityMembershipReadCapacityScenarios,
  runModerationReportListCapacity,
  runCommunityRosterReadCapacityScenario,
  runCommunityHistoryReadScenarios,
  runCommunityModerationListCapacityScenarios,
  runCommunityPublicationCapacityScenarios,
  runCommunityModerationQueueCapacityScenarios,
]
