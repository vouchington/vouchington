import { beginTransaction } from '@data-stores/psql'
import { completeClusteredStory } from './cluster-completion.mts'
import { recordStoryPostPublicationChanges } from './publication-change.mts'
import { refreshStoryPostForStory } from './refresh-story-post.mts'

async function refreshAndCaptureStoryRetry(
  query: Parameters<typeof recordStoryPostPublicationChanges>[0],
  storyId: string,
) {
  const result = await refreshStoryPostForStory(storyId, { query })
  await recordStoryPostPublicationChanges(query, storyId, result?.impactedTopicIds)
  return result
}

export async function replayClusteredStory(storyId: string): Promise<void> {
  await using query = await beginTransaction()
  const refreshResult = await refreshAndCaptureStoryRetry(query, storyId)
  await query.commit()
  await completeClusteredStory(storyId, refreshResult)
}
