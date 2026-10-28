'use client'
import { clientApi } from './instance'
import type { ListsSearchResponseBody, ListsContainingResponseBody } from '@/types/api-responses'

export function searchMyLists(
  limit = 20,
  options?: { after?: string },
): Promise<ListsSearchResponseBody> {
  return clientApi.get<ListsSearchResponseBody>('/api/v1/lists', {
    searchParams: { limit, after: options?.after },
  })
}

export function addListRssFeedItem(listId: string, rssFeedItemId: string): Promise<void> {
  return clientApi.post(`/api/v1/lists/${listId}/items/rss-feed-items`, {
    rss_feed_item_id: rssFeedItemId,
  })
}

export function removeListRssFeedItem(listId: string, rssFeedItemId: string): Promise<void> {
  return clientApi.delete(`/api/v1/lists/${listId}/items/rss-feed-items/${rssFeedItemId}`)
}

export function addListPost(listId: string, postId: string): Promise<void> {
  return clientApi.post(`/api/v1/lists/${listId}/items/posts`, { post_id: postId })
}

export function removeListPost(listId: string, postId: string): Promise<void> {
  return clientApi.delete(`/api/v1/lists/${listId}/items/posts/${postId}`)
}

export function getListsContaining(
  itemType: 'rss_feed_item' | 'post',
  entityId: string,
): Promise<ListsContainingResponseBody> {
  return clientApi.get<ListsContainingResponseBody>('/api/v1/lists/contains', {
    searchParams: { item_type: itemType, entity_id: entityId },
  })
}

export function importCommunityListClient(
  listId: string,
  communitySlug: string,
): Promise<{ posts: number; items: number }> {
  return clientApi.post<{ posts: number; items: number }>(`/api/v1/lists/${listId}/import`, {
    community_slug: communitySlug,
  })
}
