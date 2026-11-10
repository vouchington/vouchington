import { runReferralValidationPages } from './run-scenarios/referral-program-validation-pages.mts'
import { runModerationReportDetailScenarios } from './run-scenarios/moderation-report-detail.mts'
import { runMcpAdmissionScenario } from './run-scenarios/mcp-admission.mts'
import { runFkActorIndexScenarios } from './run-scenarios/fk-actor-indexes.mts'
import { runHackerNewsFilterScenarios } from './run-scenarios/hacker-news-filter.mts'
import { runUploadCleanupScenarios } from './run-scenarios/upload-cleanup.mts'
import { runRelationReadBatchScenarios } from './run-scenarios/relation-read-batches.mts'
import { runPublicationScopePageScenarios } from './run-scenarios/publication-scope-pages.mts'
import { runNotificationVisibilityScenarios } from './run-scenarios/notification-visibility.mts'
import { runDispatchWorkPlanScenarios } from './run-scenarios/dispatch-work-plans.mts'
import { runMediaDeliveryReplayScenarios } from './run-scenarios/media-delivery-replay.mts'
import {
  runMediaDeliveryGlobalPageScenarios,
  runMediaDeliveryScopedPageScenarios,
} from './run-scenarios/media-delivery-global-pages.mts'
import { runMediaDeliveryPopularImageScenario } from './run-scenarios/media-delivery-popular-image.mts'
import { seedMediaDeliveryReplay } from './seed-data/media-delivery-replay.mts'
import { runTopicAliasCategoryWorkScenarios } from './run-scenarios/topic-alias-category-work.mts'
import { runMembershipProviderRecoveryScenarios } from './run-scenarios/membership-provider-recovery.mts'
import { runRetentionStagePageScenarios } from './run-scenarios/retention-stage-pages.mts'
import { runStripeEventRecoveryScenario } from './run-scenarios/stripe-event-recovery.mts'
import { runPaymentLedgerRetentionScenarios } from './run-scenarios/payment-ledger-retention.mts'
import { runVoteScoreRankingScenarios } from './run-scenarios/vote-score-ranking.mts'
import { runMembershipRenewalSelectionScenario } from './run-scenarios/membership-renewal-selection.mts'
import { runClassifierHumanVoteComparisonScenarios } from './run-scenarios/classifier-human-vote-comparison.mts'
import { runCopyrightDeliveryBatchScenarios } from './run-scenarios/copyright-delivery-batches.mts'
import { runCopyrightCasePurgeScenarios } from './run-scenarios/copyright-case-purge.mts'
import { runClaimantMisuseWindowScenarios } from './run-scenarios/claimant-misuse-windows.mts'
import { runCopyrightStatementFactsScenarios } from './run-scenarios/copyright-statement-facts.mts'
import { runEmbeddingReconciliationScenarios } from './run-scenarios/embedding-reconciliation.mts'
import { runCommunityRoundTripScenarios } from './run-scenarios/community-round-trips.mts'
import { runSessionLimitScenarios } from './run-scenarios/session-limits.mts'
import { runImageDeliveryFoldScenarios } from './run-scenarios/image-delivery-folds.mts'
import { runRoundTripShapeScenarios } from './run-scenarios/round-trip-shapes.mts'
import { runRequestContextFoldScenarios } from './run-scenarios/request-context-folds.mts'
import { runUserProfileRoundTripScenarios } from './run-scenarios/user-profile-round-trips.mts'
import { runVoteWeightDispatchScenarios } from './run-scenarios/vote-weight-dispatch.mts'
import { seedVoteWeightDispatch } from './seed-data/vote-weight-dispatch.mts'
import { runPrioritizedReferralCacheMeasurement } from './run-scenarios/prioritized-referral-cache-measurement.mts'
import { runModerationReportContextScenarios } from './run-scenarios/moderation-report-contexts.mts'
import { runRssFeedStateChangeScenarios } from './run-scenarios/rss-feed-state-changes.mts'
import { runDenseTopicViewerCountsScenario } from './run-scenarios/topic-viewer-counts-dense.mts'
import { runLargeTopicRatingStatsScenario } from './run-scenarios/topic-rating-stats-large.mts'
import { continueAfterFailure as runStep } from './scenario-failures.mts'

export async function runLateScenarios(): Promise<void> {
  const runClassifierHumanVoteComparison = runClassifierHumanVoteComparisonScenarios
  await runStep(runClassifierHumanVoteComparison.name, runClassifierHumanVoteComparison)
  await runStep(runCopyrightStatementFactsScenarios.name, runCopyrightStatementFactsScenarios)
  await runStep(runCopyrightDeliveryBatchScenarios.name, runCopyrightDeliveryBatchScenarios)
  await runStep(runCopyrightCasePurgeScenarios.name, runCopyrightCasePurgeScenarios)
  await runStep(runClaimantMisuseWindowScenarios.name, runClaimantMisuseWindowScenarios)
  await runStep(seedMediaDeliveryReplay.name, seedMediaDeliveryReplay)
  await runStep(runMediaDeliveryReplayScenarios.name, runMediaDeliveryReplayScenarios)
  await runStep(runMediaDeliveryScopedPageScenarios.name, runMediaDeliveryScopedPageScenarios)
  await runStep(runMediaDeliveryGlobalPageScenarios.name, runMediaDeliveryGlobalPageScenarios)
  await runStep(runMediaDeliveryPopularImageScenario.name, runMediaDeliveryPopularImageScenario)
  await runStep(runRoundTripShapeScenarios.name, runRoundTripShapeScenarios)
  await runStep(runRequestContextFoldScenarios.name, runRequestContextFoldScenarios)
  await runStep(runCommunityRoundTripScenarios.name, runCommunityRoundTripScenarios)
  await runStep(runSessionLimitScenarios.name, runSessionLimitScenarios)
  await runStep(runImageDeliveryFoldScenarios.name, runImageDeliveryFoldScenarios)
  await runStep(runUserProfileRoundTripScenarios.name, runUserProfileRoundTripScenarios)
  await runStep(runUploadCleanupScenarios.name, runUploadCleanupScenarios)
  await runStep(runRelationReadBatchScenarios.name, runRelationReadBatchScenarios)
  await runStep(runDispatchWorkPlanScenarios.name, runDispatchWorkPlanScenarios)
  await runStep(runModerationReportContextScenarios.name, runModerationReportContextScenarios)
  await runStep(runModerationReportDetailScenarios.name, runModerationReportDetailScenarios)
  await runStep(runMcpAdmissionScenario.name, runMcpAdmissionScenario)
  await runStep(runRssFeedStateChangeScenarios.name, runRssFeedStateChangeScenarios)
  // Keep the mixed membership corpus out of unrelated aggregate and candidate plans.
  await runStep(seedVoteWeightDispatch.name, seedVoteWeightDispatch)
  await runStep(runVoteWeightDispatchScenarios.name, runVoteWeightDispatchScenarios)
  const runMembershipProviderRecovery = runMembershipProviderRecoveryScenarios
  await runStep(runMembershipProviderRecovery.name, runMembershipProviderRecovery)
  // Hot publication fixtures live only after all ordinary corpus plans and clean up on failure.
  await runStep(runNotificationVisibilityScenarios.name, runNotificationVisibilityScenarios)
  await runStep(runPublicationScopePageScenarios.name, runPublicationScopePageScenarios)
  await runStep(runDenseTopicViewerCountsScenario.name, runDenseTopicViewerCountsScenario)
  await runStep(runLargeTopicRatingStatsScenario.name, runLargeTopicRatingStatsScenario)
  await runStep(runTopicAliasCategoryWorkScenarios.name, runTopicAliasCategoryWorkScenarios)
  await runStep(runHackerNewsFilterScenarios.name, runHackerNewsFilterScenarios)
  await runStep(runRetentionStagePageScenarios.name, runRetentionStagePageScenarios)
  await runStep(runEmbeddingReconciliationScenarios.name, runEmbeddingReconciliationScenarios)
  await runStep(runStripeEventRecoveryScenario.name, runStripeEventRecoveryScenario)
  const runMembershipRenewalSelection = runMembershipRenewalSelectionScenario
  await runStep(runMembershipRenewalSelection.name, runMembershipRenewalSelection)
  const measureReferralCache = runPrioritizedReferralCacheMeasurement
  await runStep(measureReferralCache.name, measureReferralCache)
  await runStep(runReferralValidationPages.name, runReferralValidationPages)
  await runStep(runFkActorIndexScenarios.name, runFkActorIndexScenarios)
  await runStep(runPaymentLedgerRetentionScenarios.name, runPaymentLedgerRetentionScenarios)
  await runStep(runVoteScoreRankingScenarios.name, runVoteScoreRankingScenarios)
}
