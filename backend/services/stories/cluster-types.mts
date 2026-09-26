import type { completeClusteredStory } from './cluster-completion.mts'
import type { refreshStoryPostForStory } from './refresh-story-post.mts'

export type ClusterResult = {
  storyId: string
  created: boolean
}

export type ClusterDependencies = {
  refreshStoryPostForStory: typeof refreshStoryPostForStory
  completeClusteredStory: typeof completeClusteredStory
}

export type ClusterDependencyOverrides = Partial<ClusterDependencies>
