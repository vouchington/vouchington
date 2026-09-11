import { beginTransaction } from '@data-stores/psql'
import { completeClusteredStory } from './cluster-completion.mts'
import { lockStoryLifecycles } from '@services/post-publication/story-lifecycle-lock'
import { recordStoryPostPublicationChanges } from './publication-change.mts'
import { refreshStoryPostForStory } from './refresh-story-post.mts'

async function refreshAndCaptureStoryRetry(
  query: Parameters<typeof recordStoryPostPublicationChanges>[0],
  storyId: string,
  refresh: typeof refreshStoryPostForStory,
) {
  const result = await refresh(storyId, { query }, { enqueueAgent: false })
  await recordStoryPostPublicationChanges(query, storyId, result?.impactedTopicIds)
  return result
}

export async function replayClusteredStory(
  storyId: string,
  refresh = refreshStoryPostForStory,
  complete = completeClusteredStory,
): Promise<void> {
  await using query = await beginTransaction()
  await lockStoryLifecycles(query, [storyId])
  const refreshResult = await refreshAndCaptureStoryRetry(query, storyId, refresh)
  await query.commit()
  await complete(storyId, refreshResult)
}
