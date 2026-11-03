import { enqueueStoryPostAgent } from '@queues/ai-agents/enqueues/story-post'
import onError from '@modules/on-error'
import { invalidateStories } from './cache-invalidation.mts'
import type { StoryPostRefreshResult } from './refresh-story-post.mts'

/** Dispatches effects only after the relation refresh and publication capture commit. */
export async function completeClusteredStory(
  storyId: string,
  refreshResult: StoryPostRefreshResult | null,
): Promise<void> {
  if (refreshResult) {
    try {
      await refreshResult.dispatchPostCommitEffects()
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
    void enqueueStoryPostAgent(refreshResult.postId, { force: true })
  }
  await invalidateStories(storyId)
}
