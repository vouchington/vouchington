import { runHotPathLoaderScenarios } from './run-scenarios/hot-path-loaders.mts'
import { runRssCardBookmarkCapacityScenario } from './run-scenarios/rss-card-bookmark-capacity.mts'
import { runPublicRssPostSnapshotScenarios } from './run-scenarios/public-rss-post-snapshots.mts'
import { runPostElectionReadCapacityScenario } from './run-scenarios/post-election-read-capacity.mts'

export const READ_PATHS_RUNNERS: readonly (() => Promise<unknown>)[] = [
  runHotPathLoaderScenarios,
  runRssCardBookmarkCapacityScenario,
  runPublicRssPostSnapshotScenarios,
  runPostElectionReadCapacityScenario,
]
