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

async function main() {
  prepareOutputDir()
  try {
    await assertSeedAnchorMatches()
    await runFeedAndMetricScenarios()
    await runHeavyFollowScenarios()
    await runPostFeedShareScenarios()
    await runStoryMemberPageScenarios()
    await runSearchAndFacetScenarios()
    await runOAuthClientVerificationScenarios()
    await runEntityAndCommunityScenarios()
    await runTopicImportAttemptScenarios()
    await runHotPathLoaderScenarios()
    await runMembershipRefundScenarios()
    await runRemoteFollowerScenarios()
    await runReviewSuccessionScenarios()
    await runClassifierHumanVoteComparisonScenarios()
    await runCopyrightStatementFactsScenarios()
    await runEmbeddingReconciliationScenarios()
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
