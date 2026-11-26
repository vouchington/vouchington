import { runApplicationQuestions } from './run-scenarios/community-application-question-write.mts'
import { runCopyrightAiRunRetentionCapacityScenario } from './run-scenarios/copyright-ai-run-retention-capacity.mts'
import { runCopyrightExecutionRetentionScenarios } from './run-scenarios/copyright-execution-retention.mts'
import { runCopyrightUnlinkedEmailRetentionScenario } from './run-scenarios/copyright-unlinked-email-retention.mts'
import { runCopyrightUnlinkedRecommendationRetentionScenario } from './run-scenarios/copyright-unlinked-recommendation-retention.mts'
import { runModerationAppealListCapacity } from './run-scenarios/moderation-appeal-list-capacity.mts'
import { runApiKeyExpiryCapacityScenarios } from './run-scenarios/api-key-expiry-capacity.mts'

export const AFTER_RETENTION_RUNNERS: readonly (() => Promise<unknown>)[] = [
  // The retained form corpus changes question statistics. Analyze it after ordinary plans.
  runApplicationQuestions,
  runCopyrightAiRunRetentionCapacityScenario,
  runCopyrightExecutionRetentionScenarios,
  runCopyrightUnlinkedEmailRetentionScenario,
  runModerationAppealListCapacity,
  runApiKeyExpiryCapacityScenarios,
  runCopyrightUnlinkedRecommendationRetentionScenario,
]
