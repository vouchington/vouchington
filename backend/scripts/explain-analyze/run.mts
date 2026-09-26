import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import {
  assertScenarioManifest,
  assertSeedAnchorMatches,
  getCompletedScenarioIds,
  prepareOutputDir,
  writeResults,
} from './run-support.mts'
import { EXPLAIN_SCENARIO_MANIFEST } from './scenario-manifest.mts'
import { runEntityAndCommunityScenarios } from './run-scenarios/entities-and-communities.mts'
import { runAdmissionReservationScenarios } from './run-scenarios/admission-reservations.mts'
import { runFeedAndMetricScenarios } from './run-scenarios/feed-and-metrics.mts'
import { runHeavyFollowScenarios } from './run-scenarios/heavy-follows.mts'
import { runHotPathLoaderScenarios } from './run-scenarios/hot-path-loaders.mts'
import { runMembershipRefundScenarios } from './run-scenarios/memberships.mts'
import { runRemoteFollowerScenarios } from './run-scenarios/remote-followers.mts'
import { runReviewSuccessionScenarios } from './run-scenarios/review-successions.mts'
import { runTopicImportAttemptScenarios } from './run-scenarios/topic-import-attempts.mts'
import { runSearchAndFacetScenarios } from './run-scenarios/search-and-facets.mts'

async function main() {
  prepareOutputDir()
  try {
    await assertSeedAnchorMatches()
    await runFeedAndMetricScenarios()
    await runHeavyFollowScenarios()
    await runSearchAndFacetScenarios()
    await runEntityAndCommunityScenarios()
    await runAdmissionReservationScenarios()
    await runTopicImportAttemptScenarios()
    await runHotPathLoaderScenarios()
    await runMembershipRefundScenarios()
    await runRemoteFollowerScenarios()
    await runReviewSuccessionScenarios()
    assertScenarioManifest(getCompletedScenarioIds(), EXPLAIN_SCENARIO_MANIFEST)
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

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
