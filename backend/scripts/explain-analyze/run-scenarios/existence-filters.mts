import { seedModerationClusterPages } from '../seed-data/moderation-cluster-pages.mts'
import { runHostnameExclusionPageScenarios } from './hostname-exclusion-pages.mts'
import { runModerationClusterPageScenarios } from './moderation-cluster-pages.mts'
import { runModerationClusterWriteScenarios } from './moderation-cluster-writes.mts'
import { runModerationClusterTypedHeadScenarios } from './moderation-cluster-typed-heads.mts'
import { runRssFeedExistenceScenarios } from './rss-feed-existence.mts'
import { runModerationClusterEmptyProbeScenarios } from './moderation-cluster-empty-probes.mts'

/** Keep the new mutation-backed witnesses after the ordinary corpus scenarios. */
export async function runExistenceFilterScenarios(): Promise<void> {
  await runRssFeedExistenceScenarios()
  await runHostnameExclusionPageScenarios()
  await seedModerationClusterPages()
  await runModerationClusterPageScenarios()
  await runModerationClusterWriteScenarios()
  await runModerationClusterEmptyProbeScenarios()
  await runModerationClusterTypedHeadScenarios()
}
