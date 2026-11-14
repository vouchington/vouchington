import { invalidate } from '@services/entity-cache/invalidate'
import { invalidatePostStrict } from '@services/entity-cache/invalidate-strict'
import { getPostStoryIdsByStoryIds } from './get-post-stories.mts'

export async function invalidateStories(...storyIds: Array<string | null | undefined>) {
  const ids = [...new Set(storyIds.filter((id): id is string => typeof id === 'string'))]
  if (ids.length === 0) return

  const postIdsByStoryId = await getPostStoryIdsByStoryIds(ids)
  const postIds = Object.values(postIdsByStoryId)
  if (postIds.length > 0) await invalidate.posts(...postIds)
}

/**
 * Projection reconciliation acknowledges only after local cache deletion succeeds.
 */
export async function invalidateStoriesStrict(
  ...storyIds: Array<string | null | undefined>
): Promise<void> {
  const ids = [...new Set(storyIds.filter((id): id is string => typeof id === 'string'))]
  if (ids.length === 0) return

  const postIdsByStoryId = await getPostStoryIdsByStoryIds(ids, { readOnly: false })
  const postIds = Object.values(postIdsByStoryId)
  if (postIds.length > 0) await invalidatePostStrict(...postIds)
}
