import { dispatchStoryClusteringDecision } from '@agents/story-clustering'
import { fetchClusterItem } from './cluster-fetch.mts'
import { findClusterCandidates } from './cluster-candidates.mts'
import { completeClusteredStory } from './cluster-completion.mts'
import { refreshStoryPostForStory } from './refresh-story-post.mts'
import { replayClusteredStory } from './cluster-retry.mts'
import { assignItemToExistingStory } from './cluster-join.mts'
import { createClusteredStoryPair } from './cluster-create-pair.mts'
import type {
  ClusterDependencies,
  ClusterDependencyOverrides,
  ClusterResult,
} from './cluster-types.mts'

export type {
  ClusterResult,
  ClusterDependencies,
  ClusterDependencyOverrides,
} from './cluster-types.mts'

const defaultClusterDependencies: ClusterDependencies = {
  refreshStoryPostForStory,
  completeClusteredStory,
}

/**
 * Clusters one RSS feed item: joins it to an existing story, pairs it with a standalone item into
 * a brand-new story, or takes no action -- whichever the story-clustering Choice classifier
 * decides for `batchId` (minted once when the job is enqueued and preserved across BullMQ retries;
 * see `queues/ai-agents/enqueues/story-clustering.mts`'s `mintStoryClusteringBatchId`).
 *
 * An item already assigned to a story short-circuits to `replayClusteredStory` without ever
 * consulting `batchId` or the classifier -- nothing about that path re-runs a decision, it only
 * re-does the (idempotent) side effects of one already acted on.
 */
export async function clusterRssFeedItem(
  rss_feed_item_id: string,
  batchId: string,
  dependencyOverrides: ClusterDependencyOverrides = {},
): Promise<ClusterResult | null> {
  const dependencies = { ...defaultClusterDependencies, ...dependencyOverrides }
  const item = await fetchClusterItem(rss_feed_item_id)
  if (!item) return null
  if (item.deleted_at) return null
  if (item.story_locked_at) return null
  if (!item.has_embedding) return null
  if (item.story_id) {
    await replayClusteredStory(
      item.story_id,
      dependencies.refreshStoryPostForStory,
      dependencies.completeClusteredStory,
    )
    return { storyId: item.story_id, created: false }
  }
  if (!item.is_cluster_eligible) return null

  const outcome = await dispatchStoryClusteringDecision({
    batchId,
    incomingItemId: item.id,
    loadCandidates: () => findClusterCandidates(item),
  })

  if (outcome.kind === 'none') return null
  if (outcome.kind === 'existing_story') {
    return assignItemToExistingStory(item, outcome.storyId, dependencies)
  }
  return createClusteredStoryPair(item, outcome.rssFeedItemId, dependencies)
}
