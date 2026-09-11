import { enqueueStoryPostAgent } from '@queues/ai-agents/enqueues/story-post'
import onError from '@modules/on-error'
import { invalidateStories } from './cache-invalidation.mts'
import type { StoryPostRefreshResult } from './refresh-story-post.mts'

type ClusterCompletionDependencies = {
  enqueueStoryPostAgent?: typeof enqueueStoryPostAgent
  invalidateStories?: typeof invalidateStories
  onError?: typeof onError
}

/** Dispatches effects only after the relation refresh and publication capture commit. */
export async function completeClusteredStory(
  storyId: string,
  refreshResult: StoryPostRefreshResult | null,
  dependencies: ClusterCompletionDependencies = {},
): Promise<void> {
  const reportError = dependencies.onError ?? onError
  if (refreshResult) {
    try {
      await refreshResult.dispatchPostCommitEffects()
    } catch (error) {
      reportError(error instanceof Error ? error : new Error(String(error)))
    }
    void (dependencies.enqueueStoryPostAgent ?? enqueueStoryPostAgent)(refreshResult.postId, {
      force: true,
    })
  }
  await (dependencies.invalidateStories ?? invalidateStories)(storyId)
}
