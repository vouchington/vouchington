import { continueAfterFailure as runStep } from '../scenario-failures.mts'
import { runDataPointTopicBestCohortScenarios } from './data-point-topic-best-cohort.mts'
import {
  cleanupPostDiscoverySearchFixture,
  seedPostDiscoverySearchFixture,
} from '../seed-data/post-discovery-search.mts'
import {
  cleanupPostTopicSemiJoinFixture,
  seedPostTopicSemiJoinFixture,
} from '../seed-data/post-topic-semi-join-fixture.mts'
import { runPostDiscoverySearchScenarios } from './post-discovery-search.mts'
import { runPostTopicSemiJoinScenarios } from './post-topic-semi-join.mts'
import { runLateCommunityHotScenarios } from './community-hot-pages.mts'

/** Keep large owned post cohorts after ordinary captures and separate from each other. */
export async function runLatePostPageScenarios(): Promise<void> {
  // Deleting a large cohort does not shrink its indexes; keep that physical history
  // after ordinary topic counts so their plans retain the canonical seed corpus.
  await runStep(runDataPointTopicBestCohortScenarios.name, runDataPointTopicBestCohortScenarios)
  await runStep('runPostDiscoveryFixtureScenarios', async () => {
    await cleanupPostTopicSemiJoinFixture()
    await cleanupPostDiscoverySearchFixture()
    try {
      await seedPostDiscoverySearchFixture()
      await runPostDiscoverySearchScenarios()
      await runLateCommunityHotScenarios()
      await seedPostTopicSemiJoinFixture()
      await runPostTopicSemiJoinScenarios()
    } finally {
      await cleanupPostTopicSemiJoinFixture()
      await cleanupPostDiscoverySearchFixture()
    }
  })
}
