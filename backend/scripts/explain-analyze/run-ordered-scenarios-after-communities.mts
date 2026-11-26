import { runConversationListCapacityScenario } from './run-scenarios/conversation-list-capacity.mts'
import { runCommunitySearchCapacityScenario } from './run-scenarios/community-search-capacity.mts'
import { runCommunityMemberMetricPages } from './run-scenarios/community-member-metric-pages.mts'
import { runCommunityMembershipReadCapacityScenarios } from './run-scenarios/community-membership-read-capacity.mts'
import { runModerationReportListCapacity } from './run-scenarios/moderation-report-list-capacity.mts'

export const AFTER_COMMUNITIES_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runConversationListCapacityScenario,
  runCommunitySearchCapacityScenario,
  runCommunityMemberMetricPages,
  runCommunityMembershipReadCapacityScenarios,
  runModerationReportListCapacity,
]
