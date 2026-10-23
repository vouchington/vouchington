import { runRelationReadBatchScenarios } from './run-scenarios/relation-read-batches.mts'
import { runSelectionWork3511Scenarios } from './run-scenarios/selection-work-3511.mts'
import { runBedrockSelection3511Scenarios } from './run-scenarios/bedrock-selection-3511.mts'
import { runStoryClaim3511Scenario } from './run-scenarios/story-claim-3511.mts'
import { runCrawlSelection3511Scenarios } from './run-scenarios/crawl-selection-3511.mts'
import { runAppleSelection3511Scenario } from './run-scenarios/apple-selection-3511.mts'
import { runMailSelection3511Scenarios } from './run-scenarios/mail-selection-3511.mts'
import { runGoogleSelection3511Scenarios } from './run-scenarios/google-selection-3511.mts'
import { runCopyrightSelection3511Scenario } from './run-scenarios/copyright-selection-3511.mts'
import { runProviderSourceSelection3511Scenarios } from './run-scenarios/provider-source-selection-3511.mts'
import { runPostPublicationSelection3511Scenarios } from './run-scenarios/post-publication-selection-3511.mts'
import { runCategorySelection3511Scenarios } from './run-scenarios/category-selection-3511.mts'
import { runMediaStaging3511Scenario } from './run-scenarios/media-staging-3511.mts'
import { runMembershipVerificationSelection3511Scenario } from './run-scenarios/membership-verification-selection-3511.mts'
import { runRetentionSelection3511Scenario } from './run-scenarios/retention-selection-3511.mts'
import { runMembershipExpirySelection3511Scenario } from './run-scenarios/membership-expiry-selection-3511.mts'
import { seedSelectionWork3511 } from './seed-data/selection-work-3511.mts'
import { runAnalyze } from './seed-data/maintenance.mts'
import { runDispatchWorkPlanScenarios } from './run-scenarios/dispatch-work-plans.mts'
import { runMediaDeliveryReplayScenarios } from './run-scenarios/media-delivery-replay.mts'
import { seedMediaDeliveryReplay } from './seed-data/media-delivery-replay.mts'
import { runBloomReconciliationScenarios } from './run-scenarios/bloom-reconciliation.mts'
import { runFollowerDistributionScenarios } from './run-scenarios/follower-distributions.mts'
import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import {
  assertScenarioManifest,
  getCompletedScenarioIds,
  getResults,
  prepareOutputDir,
  seedPostId,
  writeResults,
} from './run-support.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'
import { assertSeedAnchorMatches } from './seed-anchor-check.mts'
import { SEED_ANCHOR_DATE_ENV, assertSeedAnchorNotFuture } from './seed-data/seed-anchor.mts'
import { assertNoScenarioFailures, continueAfterFailure } from './scenario-failures.mts'
import { assertPlanRegistry } from './plan-expectations.mts'
import { runEntityAndCommunityScenarios } from './run-scenarios/entities-and-communities.mts'
import { runFeedAndMetricScenarios } from './run-scenarios/feed-and-metrics.mts'
import { runHeavyFollowScenarios } from './run-scenarios/heavy-follows.mts'
import { runHotPathLoaderScenarios } from './run-scenarios/hot-path-loaders.mts'
import { runMembershipRefundScenarios } from './run-scenarios/memberships.mts'
import { runRemoteFollowerScenarios } from './run-scenarios/remote-followers.mts'
import { runReviewSuccessionScenarios } from './run-scenarios/review-successions.mts'
import { runClassifierHumanVoteComparisonScenarios } from './run-scenarios/classifier-human-vote-comparison.mts'
import { runCopyrightDeliveryBatchScenarios } from './run-scenarios/copyright-delivery-batches.mts'
import { runCopyrightStatementFactsScenarios } from './run-scenarios/copyright-statement-facts.mts'
import { runTopicImportAttemptScenarios } from './run-scenarios/topic-import-attempts.mts'
import { runSearchAndFacetScenarios } from './run-scenarios/search-and-facets.mts'
import { runOAuthClientVerificationScenarios } from './run-scenarios/oauth-client-verification.mts'
import { runPostFeedShareScenarios } from './run-scenarios/post-feed-shares.mts'
import { runEmbeddingReconciliationScenarios } from './run-scenarios/embedding-reconciliation.mts'
import { runStoryMemberPageScenarios } from './run-scenarios/story-member-pages.mts'
import { runStoryByIdScenario } from './run-scenarios/story-by-id.mts'
import { runHostnameCrawlSweepScenarios } from './run-scenarios/hostname-crawl-sweeps.mts'
import { runHostnameBlocklistScenario } from './run-scenarios/hostname-blocklist.mts'
import { runCommunityRoundTripScenarios } from './run-scenarios/community-round-trips.mts'
import { runImageDeliveryFoldScenarios } from './run-scenarios/image-delivery-folds.mts'
import { runRoundTripShapeScenarios } from './run-scenarios/round-trip-shapes.mts'
import { runRequestContextFoldScenarios } from './run-scenarios/request-context-folds.mts'
import { runMaterializedViewRefreshScenarios } from './run-scenarios/materialized-view-refreshes.mts'
import { runViewDrivenReadScenarios } from './run-scenarios/view-driven-reads.mts'
import { runUserProfileRoundTripScenarios } from './run-scenarios/user-profile-round-trips.mts'
import { runVoteWeightDispatchScenarios } from './run-scenarios/vote-weight-dispatch.mts'
import { seedVoteWeightDispatch } from './seed-data/vote-weight-dispatch.mts'
import { runSharedLoaderScenarios } from './run-scenarios/shared-loaders.mts'
import { runModerationReportContextScenarios } from './run-scenarios/moderation-report-contexts.mts'
import { runRssFeedStateChangeScenarios } from './run-scenarios/rss-feed-state-changes.mts'
import {
  removeCommittedHardDeleteWork,
  runHardDeletedPostPublicationScenarios,
} from './run-scenarios/hard-deleted-post-publication.mts'

async function seedSelectionWork3511AndAnalyze(): Promise<void> {
  // Keep sparse 10k-row selector backlogs out of the earlier legacy plan corpus.
  // A selected-only probe must call this idempotent seed before its scenario group.
  await seedSelectionWork3511()
  await runAnalyze()
}

// A failing step is recorded and the run continues, so one run reports every failure.
const RUN_STEPS: readonly (() => Promise<unknown>)[] = [
  runBloomReconciliationScenarios,
  runMaterializedViewRefreshScenarios,
  runHostnameBlocklistScenario,
  runHostnameCrawlSweepScenarios,
  runFeedAndMetricScenarios,
  runHeavyFollowScenarios,
  runPostFeedShareScenarios,
  runStoryMemberPageScenarios,
  runStoryByIdScenario,
  runSearchAndFacetScenarios,
  runOAuthClientVerificationScenarios,
  runFollowerDistributionScenarios,
  runEntityAndCommunityScenarios,
  runViewDrivenReadScenarios,
  runTopicImportAttemptScenarios,
  runHotPathLoaderScenarios,
  runSharedLoaderScenarios,
  runMembershipRefundScenarios,
  runRemoteFollowerScenarios,
  runReviewSuccessionScenarios,
  runClassifierHumanVoteComparisonScenarios,
  runCopyrightStatementFactsScenarios,
  runCopyrightDeliveryBatchScenarios,
  runEmbeddingReconciliationScenarios,
  seedMediaDeliveryReplay,
  runMediaDeliveryReplayScenarios,
  runRoundTripShapeScenarios,
  runRequestContextFoldScenarios,
  runCommunityRoundTripScenarios,
  runImageDeliveryFoldScenarios,
  runUserProfileRoundTripScenarios,
  runRelationReadBatchScenarios,
  runDispatchWorkPlanScenarios,
  runModerationReportContextScenarios,
  runRssFeedStateChangeScenarios,
  runHardDeletedPostPublicationScenarios,
  // Keep the mixed membership corpus out of unrelated aggregate and candidate plans.
  seedVoteWeightDispatch,
  runVoteWeightDispatchScenarios,
  seedSelectionWork3511AndAnalyze,
  runSelectionWork3511Scenarios,
  runBedrockSelection3511Scenarios,
  runStoryClaim3511Scenario,
  runCrawlSelection3511Scenarios,
  runAppleSelection3511Scenario,
  runMailSelection3511Scenarios,
  runGoogleSelection3511Scenarios,
  runMembershipVerificationSelection3511Scenario,
  runRetentionSelection3511Scenario,
  runMembershipExpirySelection3511Scenario,
  runCopyrightSelection3511Scenario,
  runProviderSourceSelection3511Scenarios,
  runCategorySelection3511Scenarios,
  runMediaStaging3511Scenario,
  runPostPublicationSelection3511Scenarios,
]

async function main() {
  prepareOutputDir()
  try {
    assertSeedAnchorNotFuture(process.env[SEED_ANCHOR_DATE_ENV])
    await assertSeedAnchorMatches()
    await removeCommittedHardDeleteWork(seedPostId)
    for (const step of RUN_STEPS) await continueAfterFailure(step.name, step)
    const runErrors: unknown[] = []
    for (const check of [
      () => assertScenarioManifest(getCompletedScenarioIds(), EXPLAIN_SCENARIO_MANIFEST),
      () => assertPlanRegistry(getResults().map(result => result.scenario_id ?? '')),
    ]) {
      try {
        check()
      } catch (err) {
        runErrors.push(err)
      }
    }
    assertNoScenarioFailures(runErrors)
  } finally {
    writeResults()
  }
}

async function run(): Promise<void> {
  try {
    await main()
  } finally {
    await gracefulShutdown()
  }
}

run().catch(err => {
  console.error(err)
  process.exitCode = 1
})
