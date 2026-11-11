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
import { runLatePostPageScenarios } from './run-scenarios/late-post-pages.mts'
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
import { runManyAliasTopicViewerCountsScenario } from './run-scenarios/topic-viewer-counts-many-aliases.mts'
import { runLargeTopicRatingStatsScenario } from './run-scenarios/topic-rating-stats-large.mts'

export const LATE_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runClassifierHumanVoteComparisonScenarios,
  runCopyrightStatementFactsScenarios,
  runCopyrightDeliveryBatchScenarios,
  runCopyrightCasePurgeScenarios,
  runClaimantMisuseWindowScenarios,
  seedMediaDeliveryReplay,
  runMediaDeliveryReplayScenarios,
  runMediaDeliveryScopedPageScenarios,
  runMediaDeliveryGlobalPageScenarios,
  runMediaDeliveryPopularImageScenario,
  runRoundTripShapeScenarios,
  runRequestContextFoldScenarios,
  runCommunityRoundTripScenarios,
  runSessionLimitScenarios,
  runImageDeliveryFoldScenarios,
  runUserProfileRoundTripScenarios,
  runUploadCleanupScenarios,
  runRelationReadBatchScenarios,
  runDispatchWorkPlanScenarios,
  runModerationReportContextScenarios,
  runModerationReportDetailScenarios,
  runMcpAdmissionScenario,
  runRssFeedStateChangeScenarios,
  // Keep the mixed membership corpus out of unrelated aggregate and candidate plans.
  seedVoteWeightDispatch,
  runVoteWeightDispatchScenarios,
  runMembershipProviderRecoveryScenarios,
  // The actor probes read the agent moderation and report context corpora seeded earlier in this
  // segment, so they stay in it, ahead of the hot publication fixtures.
  runFkActorIndexScenarios,
  // Hot publication fixtures live only after all ordinary corpus plans and clean up on failure.
  runNotificationVisibilityScenarios,
  runPublicationScopePageScenarios,
  runDenseTopicViewerCountsScenario,
  runManyAliasTopicViewerCountsScenario,
  runLargeTopicRatingStatsScenario,
  runTopicAliasCategoryWorkScenarios,
  runHackerNewsFilterScenarios,
  runRetentionStagePageScenarios,
  runEmbeddingReconciliationScenarios,
  runStripeEventRecoveryScenario,
  runMembershipRenewalSelectionScenario,
  runPrioritizedReferralCacheMeasurement,
  runReferralValidationPages,
  runPaymentLedgerRetentionScenarios,
  runVoteScoreRankingScenarios,
  runLatePostPageScenarios,
]
