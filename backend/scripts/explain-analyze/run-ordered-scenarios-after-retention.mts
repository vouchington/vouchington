import { runApplicationQuestions } from './run-scenarios/community-application-question-write.mts'
import { runCopyrightAiRunRetentionCapacityScenario } from './run-scenarios/copyright-ai-run-retention-capacity.mts'
import { runCopyrightExecutionRetentionScenarios } from './run-scenarios/copyright-execution-retention.mts'
import { runCopyrightUnlinkedEmailRetentionScenario } from './run-scenarios/copyright-unlinked-email-retention.mts'
import { runCopyrightUnlinkedRecommendationRetentionScenario } from './run-scenarios/copyright-unlinked-recommendation-retention.mts'
import { runModerationAppealListCapacity } from './run-scenarios/moderation-appeal-list-capacity.mts'
import { runApiKeyExpiryCapacityScenarios } from './run-scenarios/api-key-expiry-capacity.mts'
import { runModerationJudgementMaintenanceScenarios } from './run-scenarios/moderation-judgement-maintenance.mts'
import { runModerationDigestPageScenarios } from './run-scenarios/moderation-digest-pages.mts'
import { runModerationTransparencyListCapacity } from './run-scenarios/moderation-transparency-list-capacity.mts'
import { runPostEmbeddingBanEvasionRecovery } from './run-scenarios/post-embedding-ban-evasion-recovery.mts'
import { runModerationDigestEvasionCapacity } from './run-scenarios/moderation-digest-evasion-capacity.mts'
import { runPostBanEvasionSuccessorCapacity } from './run-scenarios/post-ban-evasion-successor-capacity.mts'
import { runModerationReportPostSidecars } from './run-scenarios/moderation-report-post-sidecars.mts'
import { runCopyrightReceiptReviewRetirementCapacity } from './run-scenarios/copyright-receipt-review-retirement-capacity.mts'
import { runCopyrightRetainedEmailLookupScenarios } from './run-scenarios/copyright-retained-email-lookup.mts'
import { runCopyrightEmailFormDispatchCapacityScenarios } from './run-scenarios/copyright-email-form-dispatch.mts'

export const AFTER_RETENTION_RUNNERS: readonly (() => Promise<unknown>)[] = [
  // The retained form corpus changes question statistics. Analyze it after ordinary plans.
  runApplicationQuestions,
  runModerationTransparencyListCapacity,
  runModerationDigestEvasionCapacity,
  runPostBanEvasionSuccessorCapacity,
  runModerationReportPostSidecars,
  runCopyrightAiRunRetentionCapacityScenario,
  runModerationJudgementMaintenanceScenarios,
  runModerationDigestPageScenarios,
  runPostEmbeddingBanEvasionRecovery,
  runCopyrightExecutionRetentionScenarios,
  runCopyrightUnlinkedEmailRetentionScenario,
  runModerationAppealListCapacity,
  runApiKeyExpiryCapacityScenarios,
  runCopyrightUnlinkedRecommendationRetentionScenario,
]

export const AFTER_COPYRIGHT_CAPACITY_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runCopyrightReceiptReviewRetirementCapacity,
  runCopyrightRetainedEmailLookupScenarios,
  runCopyrightEmailFormDispatchCapacityScenarios,
]
