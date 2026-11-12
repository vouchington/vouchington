import { continueAfterFailure as runStep } from '../scenario-failures.mts'
import {
  cleanupPostDiscoverySearchFixture,
  seedPostDiscoverySearchFixture,
} from '../seed-data/post-discovery-search.mts'
import { seedPostTopicSemiJoinFixture } from '../seed-data/post-topic-semi-join-fixture.mts'
import { cleanupPostTopicSemiJoinFixture } from '../seed-data/post-topic-semi-join-cleanup.mts'
import { runPostDiscoverySearchScenarios } from './post-discovery-search.mts'
import { runPostTopicSemiJoinScenarios } from './post-topic-semi-join.mts'
import { runLateCommunityHotScenarios } from './community-hot-pages.mts'

/** Keep large owned post cohorts after ordinary captures and separate from each other. */
export async function runLatePostPageScenarios(): Promise<void> {
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
