import { runPostModerationRetentionScenarios } from './run-scenarios/post-moderation-retention.mts'
import { seedAndAnalyzeAgentModerationRetention } from './seed-data/agent-moderation-retention.mts'
import {
  runAgentModerationRetentionScenarios,
  runModerationTransparencyReleaseScenario,
} from './run-scenarios/agent-moderation-retention.mts'
import { runPostModerationHistoryPageScenarios } from './run-scenarios/post-moderation-history-page.mts'
import { runPostModerationBatchCapacityScenario } from './run-scenarios/post-moderation-batch-capacity.mts'

export const MODERATION_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runPostModerationRetentionScenarios,
  seedAndAnalyzeAgentModerationRetention,
  runAgentModerationRetentionScenarios,
  runModerationTransparencyReleaseScenario,
  runPostModerationHistoryPageScenarios,
  runPostModerationBatchCapacityScenario,
]
