import { invalidate } from '@services/entity-cache/invalidate'
import {
  invalidateHtmlStrict,
  invalidatePostStrict,
  invalidateStoryStrict,
} from '@services/entity-cache/invalidate-strict'
import { getPostStoryIdsByStoryIds } from './get-post-stories.mts'

export async function invalidateStories(...storyIds: Array<string | null | undefined>) {
  const ids = [...new Set(storyIds.filter((id): id is string => typeof id === 'string'))]
  if (ids.length === 0) return

  const postIdsByStoryId = await getPostStoryIdsByStoryIds(ids)
  const postIds = Object.values(postIdsByStoryId)
  await Promise.all([
    invalidate.stories(...ids),
    postIds.length > 0 ? invalidate.posts(...postIds) : Promise.resolve(),
    invalidate.html(),
  ])
}

/**
 * Projection reconciliation only acknowledges invalidation after every cache delete and tag-purge
 * enqueue succeeds, so a transient cache or queue failure remains durable work for the next lease.
 */
export async function invalidateStoriesStrict(
  ...storyIds: Array<string | null | undefined>
): Promise<void> {
  const ids = [...new Set(storyIds.filter((id): id is string => typeof id === 'string'))]
  if (ids.length === 0) return

  const postIdsByStoryId = await getPostStoryIdsByStoryIds(ids, { readOnly: false })
  const postIds = Object.values(postIdsByStoryId)
  await Promise.all([
    invalidateStoryStrict(...ids),
    postIds.length > 0 ? invalidatePostStrict(...postIds) : Promise.resolve(),
    invalidateHtmlStrict(),
  ])
}
