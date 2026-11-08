import { runReferralValidationPages } from './run-scenarios/referral-program-validation-pages.mts'
import { runMembershipExpiryPageScenarios } from './run-scenarios/membership-expiry-pages.mts'
import { runFkActorIndexScenarios } from './run-scenarios/fk-actor-indexes.mts'
import { runCategoryProjectionScenarios } from './run-scenarios/category-projection.mts'
import { runHackerNewsFilterScenarios } from './run-scenarios/hacker-news-filter.mts'
import { runStoryProjectionWorkScenarios } from './run-scenarios/story-projection-work.mts'
import { runImageQuarantineScenarios } from './run-scenarios/image-quarantine.mts'
import { runUploadCleanupScenarios } from './run-scenarios/upload-cleanup.mts'
import { runSitemapPageScenarios } from './run-scenarios/sitemap-pages.mts'
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
import { runBloomReconciliationScenarios } from './run-scenarios/bloom-reconciliation.mts'
import { runFollowerDistributionScenarios } from './run-scenarios/follower-distributions.mts'
import { runEntityAndCommunityScenarios } from './run-scenarios/entities-and-communities.mts'
import { runFeedAndMetricScenarios } from './run-scenarios/feed-and-metrics.mts'
import { runHeavyFollowScenarios } from './run-scenarios/heavy-follows.mts'
import { runHotPathLoaderScenarios } from './run-scenarios/hot-path-loaders.mts'
import { runStorySearchScenarios } from './run-scenarios/story-search.mts'
import { runMembershipScenarios } from './run-scenarios/memberships.mts'
import { runMembershipWorkSelectionScenarios } from './run-scenarios/membership-work-selection.mts'
import { runEngagementEmailRecipientScenarios } from './run-scenarios/engagement-email-recipients.mts'
import { runTopicAliasCategoryWorkScenarios } from './run-scenarios/topic-alias-category-work.mts'
import { runMembershipProviderRecoveryScenarios } from './run-scenarios/membership-provider-recovery.mts'
import { runRetentionStagePageScenarios } from './run-scenarios/retention-stage-pages.mts'
import { runStripeEventRecoveryScenario } from './run-scenarios/stripe-event-recovery.mts'
import { runPaymentLedgerRetentionScenarios } from './run-scenarios/payment-ledger-retention.mts'
import { runVoteScoreRankingScenarios } from './run-scenarios/vote-score-ranking.mts'
import { runMembershipRenewalSelectionScenario } from './run-scenarios/membership-renewal-selection.mts'
import { runRemoteFollowerScenarios } from './run-scenarios/remote-followers.mts'
import { runReviewSuccessionScenarios } from './run-scenarios/review-successions.mts'
import { runClassifierHumanVoteComparisonScenarios } from './run-scenarios/classifier-human-vote-comparison.mts'
import { runCopyrightDeliveryBatchScenarios } from './run-scenarios/copyright-delivery-batches.mts'
import { runCopyrightCasePurgeScenarios } from './run-scenarios/copyright-case-purge.mts'
import { runClaimantMisuseWindowScenarios } from './run-scenarios/claimant-misuse-windows.mts'
import { runCopyrightStatementFactsScenarios } from './run-scenarios/copyright-statement-facts.mts'
import { runTopicImportAttemptScenarios } from './run-scenarios/topic-import-attempts.mts'
import { runImportRequestRetentionScenarios } from './run-scenarios/import-request-retention.mts'
import { runSearchAndFacetScenarios } from './run-scenarios/search-and-facets.mts'
import { runOAuthClientVerificationScenarios } from './run-scenarios/oauth-client-verification.mts'
import { runPostFeedShareScenarios } from './run-scenarios/post-feed-shares.mts'
import { runEmbeddingReconciliationScenarios } from './run-scenarios/embedding-reconciliation.mts'
import { runStoryMemberPageScenarios } from './run-scenarios/story-member-pages.mts'
import { runStoryByIdScenario } from './run-scenarios/story-by-id.mts'
import { runHostnameCrawlSweepScenarios } from './run-scenarios/hostname-crawl-sweeps.mts'
import { runCrawlerBoilerplateScenario } from './run-scenarios/crawler-boilerplate.mts'
import { runHostnameBlocklistScenario } from './run-scenarios/hostname-blocklist.mts'
import { runCommunityRoundTripScenarios } from './run-scenarios/community-round-trips.mts'
import { runSessionLimitScenarios } from './run-scenarios/session-limits.mts'
import { runImageDeliveryFoldScenarios } from './run-scenarios/image-delivery-folds.mts'
import { runRoundTripShapeScenarios } from './run-scenarios/round-trip-shapes.mts'
import { runRequestContextFoldScenarios } from './run-scenarios/request-context-folds.mts'
import { runMaterializedViewRefreshScenarios } from './run-scenarios/materialized-view-refreshes.mts'
import { runIngestionRawPageScenarios } from './run-scenarios/ingestion-raw-pages.mts'
import { runViewDrivenReadScenarios } from './run-scenarios/view-driven-reads.mts'
import { runUserProfileRoundTripScenarios } from './run-scenarios/user-profile-round-trips.mts'
import { runVoteWeightDispatchScenarios } from './run-scenarios/vote-weight-dispatch.mts'
import { seedVoteWeightDispatch } from './seed-data/vote-weight-dispatch.mts'
import { seedAndAnalyzeAgentModerationRetention } from './seed-data/agent-moderation-retention.mts'
import { runSharedLoaderScenarios } from './run-scenarios/shared-loaders.mts'
import { runPrioritizedReferralCacheMeasurement } from './run-scenarios/prioritized-referral-cache-measurement.mts'
import { runModerationReportContextScenarios } from './run-scenarios/moderation-report-contexts.mts'
import { runRssFeedStateChangeScenarios } from './run-scenarios/rss-feed-state-changes.mts'
import { runPostModerationRetentionScenarios } from './run-scenarios/post-moderation-retention.mts'
import { runDenseTopicViewerCountsScenario } from './run-scenarios/topic-viewer-counts-dense.mts'
import { runSpamSignalScenarios } from './run-scenarios/spam-signals.mts'
import { runAgentModerationRetentionScenarios } from './run-scenarios/agent-moderation-retention.mts'
import { continueAfterFailure as runStep } from './scenario-failures.mts'

// Order matters: earlier scenarios mutate the one shared corpus. See the comments below
// before moving a runner.
export async function runScenariosBeforePartition(): Promise<void> {
  await runStep(runSitemapPageScenarios.name, runSitemapPageScenarios)
  await runStep(runStoryProjectionWorkScenarios.name, runStoryProjectionWorkScenarios)
  await runStep(runImageQuarantineScenarios.name, runImageQuarantineScenarios)
  await runStep(runBloomReconciliationScenarios.name, runBloomReconciliationScenarios)
  await runStep(runMaterializedViewRefreshScenarios.name, runMaterializedViewRefreshScenarios)
  await runStep(runIngestionRawPageScenarios.name, runIngestionRawPageScenarios)
  await runStep(runHostnameBlocklistScenario.name, runHostnameBlocklistScenario)
  await runStep(runHostnameCrawlSweepScenarios.name, runHostnameCrawlSweepScenarios)
  await runStep(runCrawlerBoilerplateScenario.name, runCrawlerBoilerplateScenario)
  await runStep(runFeedAndMetricScenarios.name, runFeedAndMetricScenarios)
  await runStep(runHeavyFollowScenarios.name, runHeavyFollowScenarios)
  await runStep(runPostFeedShareScenarios.name, runPostFeedShareScenarios)
  await runStep(runStoryMemberPageScenarios.name, runStoryMemberPageScenarios)
  await runStep(runStoryByIdScenario.name, runStoryByIdScenario)
  await runStep(runSearchAndFacetScenarios.name, runSearchAndFacetScenarios)
  await runStep(runSpamSignalScenarios.name, runSpamSignalScenarios)
  await runStep(runOAuthClientVerificationScenarios.name, runOAuthClientVerificationScenarios)
  await runStep(runFollowerDistributionScenarios.name, runFollowerDistributionScenarios)
  await runStep(runEntityAndCommunityScenarios.name, runEntityAndCommunityScenarios)
  await runStep(runViewDrivenReadScenarios.name, runViewDrivenReadScenarios)
  await runStep(runTopicImportAttemptScenarios.name, runTopicImportAttemptScenarios)
  await runStep(runImportRequestRetentionScenarios.name, runImportRequestRetentionScenarios)
  await runStep(runPostModerationRetentionScenarios.name, runPostModerationRetentionScenarios)
  const analyzeAgentModerationRetention = seedAndAnalyzeAgentModerationRetention
  await runStep(analyzeAgentModerationRetention.name, analyzeAgentModerationRetention)
  await runStep(runAgentModerationRetentionScenarios.name, runAgentModerationRetentionScenarios)
  await runStep(runHotPathLoaderScenarios.name, runHotPathLoaderScenarios)
  // Hidden-feed story search leaves 240 story_posts rows. Profile collection pages join
  // that table, and the generic plan sorts once those rows exist.
  await runStep(runStorySearchScenarios.name, runStorySearchScenarios)
  await runStep(runSharedLoaderScenarios.name, runSharedLoaderScenarios)
  await runStep(runMembershipWorkSelectionScenarios.name, runMembershipWorkSelectionScenarios)
  await runStep(runEngagementEmailRecipientScenarios.name, runEngagementEmailRecipientScenarios)
  await runStep(runRemoteFollowerScenarios.name, runRemoteFollowerScenarios)
  await runStep(runReviewSuccessionScenarios.name, runReviewSuccessionScenarios)
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

// Late fixture writers seed after every ordinary plan and never read the comment partitions.
export async function runScenariosAfterPartition(): Promise<void> {
  await runStep(runCategoryProjectionScenarios.name, runCategoryProjectionScenarios)
  await runStep(runMembershipScenarios.name, runMembershipScenarios)
  // Expiry fixtures come after the shared membership writer's corpus and all ordinary plans.
  await runStep(runMembershipExpiryPageScenarios.name, runMembershipExpiryPageScenarios)
}
