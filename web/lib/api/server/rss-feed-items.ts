import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  EntityFollowContextResponseBody,
  RssFeedItemResponseBody,
  RssFeedItemsListResponseBody,
} from '@/types/api-responses'
import type { ReferenceListResponseBody } from '@/types/api-responses/lists'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
import type { UserProfileCollection } from '@ts-shared/user-profile-collections'

type RssFeedItemCollectionListType = Extract<
  UserProfileCollection,
  { routeSegment: 'rss-feed-items' }
>['routeListType']

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

export const getRssFeedItems = cache(function getRssFeedItems(
  options?: GetOptions,
): Promise<RssFeedItemsFeedResponseBody> {
  return serverApi.get<RssFeedItemsFeedResponseBody>('/api/v1/rss-feed-items', options)
})

export const getRssFeedItem = cache(async (id: string) =>
  returnNullForMissingEntity(
    serverApi.get<RssFeedItemResponseBody>(`/api/v1/rss-feed-items/${encodeURIComponent(id)}`),
  ),
)

export const getRssFeedItemFollowContext = cache(async (id: string) =>
  returnNullForMissingEntity(
    serverApi.get<EntityFollowContextResponseBody>(
      `/api/v1/rss-feed-items/${encodeURIComponent(id)}/follow-context`,
    ),
  ),
)

export const getUserRssFeedItemsCollection = cache(
  async (
    idOrUsername: string,
    listType: RssFeedItemCollectionListType,
    options?: { mediaType?: string; limit?: number },
  ): Promise<RssFeedItemsListResponseBody | null> => {
    const searchParams = { media_type: options?.mediaType, limit: options?.limit }
    return returnNullForMissingEntity(
      serverApi.get<RssFeedItemsListResponseBody>(
        `/api/v1/users/${encodeURIComponent(idOrUsername)}/rss-feed-items/${encodeURIComponent(listType)}`,
        options?.mediaType || options?.limit ? { searchParams } : undefined,
      ),
      { nullStatusCodes: [401, 403, 404] },
    )
  },
)

export const getUserRssFeedItemBookmarkReferences = cache(
  async (
    idOrUsername: string,
    listType: RssFeedItemCollectionListType,
    options?: { mediaType?: string; limit?: number },
  ): Promise<ReferenceListResponseBody<{ id: string }> | null> => {
    const searchParams = { media_type: options?.mediaType, limit: options?.limit }
    return returnNullForMissingEntity(
      serverApi.get<ReferenceListResponseBody<{ id: string }>>(
        `/api/v1/users/${encodeURIComponent(idOrUsername)}/rss-feed-items/${encodeURIComponent(listType)}`,
        options?.mediaType || options?.limit ? { searchParams } : undefined,
      ),
      { nullStatusCodes: [401, 403, 404] },
    )
  },
)
