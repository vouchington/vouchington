import { runApplicationQuestions } from './run-scenarios/community-application-question-write.mts'
import { runCopyrightAiRunRetentionCapacityScenario } from './run-scenarios/copyright-ai-run-retention-capacity.mts'
import { runCopyrightExecutionRetentionScenarios } from './run-scenarios/copyright-execution-retention.mts'
import { runCopyrightUnlinkedEmailRetentionScenario } from './run-scenarios/copyright-unlinked-email-retention.mts'
import { runModerationAppealListCapacity } from './run-scenarios/moderation-appeal-list-capacity.mts'
import { runApiKeyExpiryCapacityScenarios } from './run-scenarios/api-key-expiry-capacity.mts'
import { runModerationJudgementMaintenanceScenarios } from './run-scenarios/moderation-judgement-maintenance.mts'
import { runModerationDigestPageScenarios } from './run-scenarios/moderation-digest-pages.mts'
import { runModerationTransparencyListCapacity } from './run-scenarios/moderation-transparency-list-capacity.mts'
import { runPostEmbeddingBanEvasionRecovery } from './run-scenarios/post-embedding-ban-evasion-recovery.mts'

export const AFTER_RETENTION_RUNNERS: readonly (() => Promise<unknown>)[] = [
  // The retained form corpus changes question statistics. Analyze it after ordinary plans.
  runApplicationQuestions,
  runModerationTransparencyListCapacity,
  runCopyrightAiRunRetentionCapacityScenario,
  runModerationJudgementMaintenanceScenarios,
  runModerationDigestPageScenarios,
  runPostEmbeddingBanEvasionRecovery,
  runCopyrightExecutionRetentionScenarios,
  runCopyrightUnlinkedEmailRetentionScenario,
  runModerationAppealListCapacity,
  runApiKeyExpiryCapacityScenarios,
]
