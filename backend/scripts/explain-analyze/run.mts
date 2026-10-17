import { runRelationReadBatchScenarios } from './run-scenarios/relation-read-batches.mts'
import { runDispatchWorkPlanScenarios } from './run-scenarios/dispatch-work-plans.mts'
import { runMediaDeliveryReplayScenarios } from './run-scenarios/media-delivery-replay.mts'
import { seedMediaDeliveryReplay } from './seed-data/media-delivery-replay.mts'
import { runBloomReconciliationScenarios } from './run-scenarios/bloom-reconciliation.mts'
import { runFollowerDistributionScenarios } from './run-scenarios/follower-distributions.mts'
import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import {
  assertScenarioManifest,
  assertSeedAnchorMatches,
  getCompletedScenarioIds,
  getResults,
  prepareOutputDir,
  writeResults,
} from './run-support.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'
import { assertPlanRegistry } from './plan-expectations.mts'
import { runEntityAndCommunityScenarios } from './run-scenarios/entities-and-communities.mts'
import { runFeedAndMetricScenarios } from './run-scenarios/feed-and-metrics.mts'
import { runHeavyFollowScenarios } from './run-scenarios/heavy-follows.mts'
import { runHotPathLoaderScenarios } from './run-scenarios/hot-path-loaders.mts'
import { runMembershipRefundScenarios } from './run-scenarios/memberships.mts'
import { runRemoteFollowerScenarios } from './run-scenarios/remote-followers.mts'
import { runReviewSuccessionScenarios } from './run-scenarios/review-successions.mts'
import { runClassifierHumanVoteComparisonScenarios } from './run-scenarios/classifier-human-vote-comparison.mts'
import { runCopyrightStatementFactsScenarios } from './run-scenarios/copyright-statement-facts.mts'
import { runTopicImportAttemptScenarios } from './run-scenarios/topic-import-attempts.mts'
import { runSearchAndFacetScenarios } from './run-scenarios/search-and-facets.mts'
import { runOAuthClientVerificationScenarios } from './run-scenarios/oauth-client-verification.mts'
import { runPostFeedShareScenarios } from './run-scenarios/post-feed-shares.mts'
import { runEmbeddingReconciliationScenarios } from './run-scenarios/embedding-reconciliation.mts'
import { runStoryMemberPageScenarios } from './run-scenarios/story-member-pages.mts'
import { runHostnameCrawlSweepScenarios } from './run-scenarios/hostname-crawl-sweeps.mts'
import { runHostnameBlocklistScenario } from './run-scenarios/hostname-blocklist.mts'
import { runCommunityRoundTripScenarios } from './run-scenarios/community-round-trips.mts'
import { runImageDeliveryFoldScenarios } from './run-scenarios/image-delivery-folds.mts'
import { runRoundTripShapeScenarios } from './run-scenarios/round-trip-shapes.mts'
import { runMaterializedViewRefreshScenarios } from './run-scenarios/materialized-view-refreshes.mts'
import { runViewDrivenReadScenarios } from './run-scenarios/view-driven-reads.mts'
import { runUserProfileRoundTripScenarios } from './run-scenarios/user-profile-round-trips.mts'
import { runVoteWeightDispatchScenarios } from './run-scenarios/vote-weight-dispatch.mts'
import { seedVoteWeightDispatch } from './seed-data/vote-weight-dispatch.mts'
import { runSharedLoaderScenarios } from './run-scenarios/shared-loaders.mts'
import { runModerationReportContextScenarios } from './run-scenarios/moderation-report-contexts.mts'

async function main() {
  prepareOutputDir()
  try {
    await assertSeedAnchorMatches()
    await runBloomReconciliationScenarios()
    await runMaterializedViewRefreshScenarios()
    await runHostnameBlocklistScenario()
    await runHostnameCrawlSweepScenarios()
    await runFeedAndMetricScenarios()
    await runHeavyFollowScenarios()
    await runPostFeedShareScenarios()
    await runStoryMemberPageScenarios()
    await runSearchAndFacetScenarios()
    await runOAuthClientVerificationScenarios()
    await runFollowerDistributionScenarios()
    await runEntityAndCommunityScenarios()
    await runViewDrivenReadScenarios()
    await runTopicImportAttemptScenarios()
    await runHotPathLoaderScenarios()
    await runSharedLoaderScenarios()
    await runMembershipRefundScenarios()
    await runRemoteFollowerScenarios()
    await runReviewSuccessionScenarios()
    await runClassifierHumanVoteComparisonScenarios()
    await runCopyrightStatementFactsScenarios()
    await runEmbeddingReconciliationScenarios()
    await seedMediaDeliveryReplay()
    await runMediaDeliveryReplayScenarios()
    await runRoundTripShapeScenarios()
    await runCommunityRoundTripScenarios()
    await runImageDeliveryFoldScenarios()
    await runUserProfileRoundTripScenarios()
    await runRelationReadBatchScenarios()
    await runDispatchWorkPlanScenarios()
    await runModerationReportContextScenarios()
    // Keep the mixed membership corpus out of unrelated aggregate and candidate plans.
    await seedVoteWeightDispatch()
    await runVoteWeightDispatchScenarios()
    assertScenarioManifest(getCompletedScenarioIds(), EXPLAIN_SCENARIO_MANIFEST)
    assertPlanRegistry(getResults().map(result => result.scenario_id ?? ''))
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
