import type { BasicUser } from '@services/users/types'
import {
  getStoryMemberPagesBatch,
  type StoryMemberRequest,
} from '@services/feeds/rss-feed-items/story-member-pages'
import { getStoryRelatedItemsConfig } from './story-related-items-config.mts'

type StoryPrimaryResult = {
  id: string
  entity_id?: string
  story_id: string | null
  delivery_type?: 'direct' | 'share'
}

function getStoryPreviewRequests(results: readonly StoryPrimaryResult[]): StoryMemberRequest[] {
  const selected = new Map<string, StoryMemberRequest>()
  for (const result of results) {
    if (result.delivery_type === 'share' || !result.story_id || selected.has(result.story_id))
      continue
    selected.set(result.story_id, {
      story_id: result.story_id,
      exclude_item_id: result.entity_id ?? result.id,
    })
  }
  return [...selected.values()]
}

function explicitStoryPreviewLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 3)
    throw new RangeError('Story preview limit must be an integer from 1 to 3')
  return limit
}

export function getStoryPreviews(
  currentUser: BasicUser | null,
  results: readonly StoryPrimaryResult[],
  options?: { limit?: number },
) {
  const limit =
    options?.limit === undefined
      ? getStoryRelatedItemsConfig().preview_limit
      : explicitStoryPreviewLimit(options.limit)
  return getStoryMemberPagesBatch(currentUser, getStoryPreviewRequests(results), { limit })
}
