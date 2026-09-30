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

export function getStoryPreviewRequests(
  results: readonly StoryPrimaryResult[],
): StoryMemberRequest[] {
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

export function getStoryPreviews(
  currentUser: BasicUser | null,
  results: readonly StoryPrimaryResult[],
) {
  const { preview_limit } = getStoryRelatedItemsConfig()
  return getStoryMemberPagesBatch(currentUser, getStoryPreviewRequests(results), {
    limit: preview_limit,
  })
}
