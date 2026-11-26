import { runReferralValidationPages } from './run-scenarios/referral-program-validation-pages.mts'
import { runCopyrightSuspendedClaimantRecoveryCapacityScenarios } from './run-scenarios/copyright-suspended-claimant-recovery.mts'
import { runCopyrightStatutoryRestorationCapacityScenarios } from './run-scenarios/copyright-statutory-restoration.mts'
import { runCopyrightPendingEnforcementScenarios } from './run-scenarios/copyright-pending-enforcement.mts'
import { runCopyrightActionIntentRecoveryCapacityScenarios } from './run-scenarios/copyright-action-intent-recovery.mts'
import { runCopyrightDeliveryIntentRecoveryCapacityScenarios } from './run-scenarios/copyright-delivery-intent-recovery.mts'
import { runModerationReportDetailScenarios } from './run-scenarios/moderation-report-detail.mts'
import { runFeedPostHydrationCapacityScenario } from './run-scenarios/feed-post-hydration-capacity.mts'
import { runMcpAdmissionScenario } from './run-scenarios/mcp-admission.mts'
import { runFkActorIndexScenarios } from './run-scenarios/fk-actor-indexes.mts'
import { runHackerNewsFilterScenarios } from './run-scenarios/hacker-news-filter.mts'
import { runHackerNewsCardSidecarScenarios } from './run-scenarios/hacker-news-card-sidecars.mts'
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
import { runCopyrightHoldRestoreRecoveryCapacityScenarios } from './run-scenarios/copyright-hold-restore-recovery.mts'
import { runCopyrightFormReviewRecoveryScenarios } from './run-scenarios/copyright-form-review-recovery.mts'
import { runCopyrightTrustedFlaggerCapacityScenarios } from './run-scenarios/copyright-trusted-flaggers.mts'
import { runMembershipProviderRecoveryScenarios } from './run-scenarios/membership-provider-recovery.mts'
import { runRetentionStagePageScenarios } from './run-scenarios/retention-stage-pages.mts'
import { runStripeEventRecoveryScenario } from './run-scenarios/stripe-event-recovery.mts'
import { runPaymentLedgerRetentionScenarios } from './run-scenarios/payment-ledger-retention.mts'
import { runPostCommunityHydrationCapacityScenario } from './run-scenarios/post-community-hydration-capacity.mts'
import { runLatePostPageScenarios } from './run-scenarios/late-post-pages.mts'
import { runVoteScoreRankingScenarios } from './run-scenarios/vote-score-ranking.mts'
import { runMembershipRenewalSelectionScenario } from './run-scenarios/membership-renewal-selection.mts'
import { runClassifierHumanVoteComparisonScenarios } from './run-scenarios/classifier-human-vote-comparison.mts'
import { runCopyrightDeliveryBatchScenarios } from './run-scenarios/copyright-delivery-batches.mts'
import { runCopyrightCasePurgeScenarios } from './run-scenarios/copyright-case-purge.mts'
import { runCopyrightStuckRunCapacityScenarios } from './run-scenarios/copyright-stuck-runs.mts'
import { runCopyrightGuestRetentionScenario } from './run-scenarios/copyright-guest-retention.mts'
import { runClaimantMisuseWindowScenarios } from './run-scenarios/claimant-misuse-windows.mts'
import { runCopyrightStatementFactsScenarios } from './run-scenarios/copyright-statement-facts.mts'
import { runEmbeddingReconciliationScenarios } from './run-scenarios/embedding-reconciliation.mts'
import { runCommunityRoundTripScenarios } from './run-scenarios/community-round-trips.mts'
import { runSessionLimitScenarios } from './run-scenarios/session-limits.mts'
import { runImageDeliveryFoldScenarios } from './run-scenarios/image-delivery-folds.mts'
import { runRoundTripShapeScenarios } from './run-scenarios/round-trip-shapes.mts'
import { runPostProvenanceCapacityScenario } from './run-scenarios/post-provenance-capacity.mts'
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
import { runRssFeedDedupCapacity } from './run-scenarios/rss-feed-dedup-capacity.mts'
import { runRssCrawlFetchLookupCapacity } from './run-scenarios/rss-crawl-fetch-lookup-capacity.mts'
import { runRssFeedDiscoverabilityCapacity } from './run-scenarios/rss-feed-discoverability-capacity.mts'
import { runRssIngestExistingItemsCapacity } from './run-scenarios/rss-ingest-existing-items-capacity.mts'
import { runRssTrendingCapacity } from './run-scenarios/rss-trending-capacity.mts'
import { runNotificationRssSnapshotCapacity } from './run-scenarios/notification-rss-snapshot-capacity.mts'
import { runNotificationPostSnapshotCapacity } from './run-scenarios/notification-post-snapshot-capacity.mts'
import { runNotificationRedirectCapacity } from './run-scenarios/notification-redirect-capacity.mts'
import { runTopicMergeRelationFlagCapacity } from './run-scenarios/topic-merge-relation-flag-capacity.mts'

export const LATE_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runClassifierHumanVoteComparisonScenarios,
  runCopyrightStatementFactsScenarios,
  runCopyrightDeliveryBatchScenarios,
  runCopyrightCasePurgeScenarios,
  runCopyrightStuckRunCapacityScenarios,
  runClaimantMisuseWindowScenarios,
  runCopyrightGuestRetentionScenario,
  seedMediaDeliveryReplay,
  runMediaDeliveryReplayScenarios,
  runMediaDeliveryScopedPageScenarios,
  runMediaDeliveryGlobalPageScenarios,
  runMediaDeliveryPopularImageScenario,
  runRoundTripShapeScenarios,
  runPostProvenanceCapacityScenario,
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
  runFeedPostHydrationCapacityScenario,
  runMcpAdmissionScenario,
  runRssFeedStateChangeScenarios,
  // Keep the mixed membership corpus out of unrelated aggregate and candidate plans.
  seedVoteWeightDispatch,
  runVoteWeightDispatchScenarios,
  runCopyrightSuspendedClaimantRecoveryCapacityScenarios,
  runCopyrightStatutoryRestorationCapacityScenarios,
  runCopyrightPendingEnforcementScenarios,
  runCopyrightActionIntentRecoveryCapacityScenarios,
  runCopyrightDeliveryIntentRecoveryCapacityScenarios,
  runMembershipProviderRecoveryScenarios,
  runCopyrightHoldRestoreRecoveryCapacityScenarios,
  runCopyrightFormReviewRecoveryScenarios,
  runCopyrightTrustedFlaggerCapacityScenarios,
  // The actor probes read the agent moderation and report context corpora seeded earlier in this
  // segment, so they stay in it, ahead of the hot publication fixtures.
  runFkActorIndexScenarios,
  runPostCommunityHydrationCapacityScenario,
  // Hot publication fixtures live only after all ordinary corpus plans and clean up on failure.
  runNotificationVisibilityScenarios,
  runPublicationScopePageScenarios,
  runDenseTopicViewerCountsScenario,
  runManyAliasTopicViewerCountsScenario,
  runLargeTopicRatingStatsScenario,
  runTopicAliasCategoryWorkScenarios,
  runHackerNewsFilterScenarios,
  runRetentionStagePageScenarios,
  runHackerNewsCardSidecarScenarios,
  runEmbeddingReconciliationScenarios,
  runStripeEventRecoveryScenario,
  runMembershipRenewalSelectionScenario,
  runPrioritizedReferralCacheMeasurement,
  runReferralValidationPages,
  runPaymentLedgerRetentionScenarios,
  runVoteScoreRankingScenarios,
  runLatePostPageScenarios,
  runRssFeedDedupCapacity,
  runRssCrawlFetchLookupCapacity,
  runRssFeedDiscoverabilityCapacity,
  runRssIngestExistingItemsCapacity,
  runRssTrendingCapacity,
  runNotificationRssSnapshotCapacity,
  runNotificationPostSnapshotCapacity,
  runNotificationRedirectCapacity,
  runTopicMergeRelationFlagCapacity,
]
