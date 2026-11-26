import { runUploadCleanupScenarios } from './run-scenarios/upload-cleanup.mts'
import { runRelationReadBatchScenarios } from './run-scenarios/relation-read-batches.mts'
import { runDispatchWorkPlanScenarios } from './run-scenarios/dispatch-work-plans.mts'
import { runModerationReportContextScenarios } from './run-scenarios/moderation-report-contexts.mts'
import { runModerationReportDetailScenarios } from './run-scenarios/moderation-report-detail.mts'
import { runFeedPostHydrationCapacityScenario } from './run-scenarios/feed-post-hydration-capacity.mts'
import { runMcpAdmissionScenario } from './run-scenarios/mcp-admission.mts'
import { runRssFeedStateChangeScenarios } from './run-scenarios/rss-feed-state-changes.mts'

export const UPLOADS_REPORTS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runUploadCleanupScenarios,
  runRelationReadBatchScenarios,
  runDispatchWorkPlanScenarios,
  runModerationReportContextScenarios,
  runModerationReportDetailScenarios,
  runFeedPostHydrationCapacityScenario,
  runMcpAdmissionScenario,
  runRssFeedStateChangeScenarios,
]
