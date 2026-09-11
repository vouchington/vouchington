'use client'
import { clientApi } from './instance'
import type {
  ListItemsResponseBody,
  ListResponseBody,
  ListsSearchResponseBody,
  ListsContainingResponseBody,
} from '@/types/api-responses'

export function createList(data: {
  name: string
  description?: string | null
  visibility?: 'private' | 'unlisted' | 'public'
}): Promise<ListResponseBody> {
  return clientApi.post<ListResponseBody>('/api/v1/lists', data)
}

export function updateList(
  listId: string,
  data: {
    name?: string
    description?: string | null
    visibility?: 'private' | 'unlisted' | 'public'
  },
): Promise<ListResponseBody> {
  return clientApi.patch<ListResponseBody>(`/api/v1/lists/${listId}`, data)
}

export function deleteList(listId: string): Promise<void> {
  return clientApi.delete(`/api/v1/lists/${listId}`)
}

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

export function searchListItemsClient(
  listId: string,
  params: { media_type?: string; read?: boolean; after?: string; limit?: number } = {},
): Promise<ListItemsResponseBody> {
  return clientApi.get<ListItemsResponseBody>(`/api/v1/lists/${listId}/items`, {
    searchParams: {
      media_type: params.media_type,
      read: params.read !== undefined ? String(params.read) : undefined,
      after: params.after,
      limit: params.limit,
    },
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
