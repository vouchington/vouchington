import { cache } from 'react'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import { serverApi } from './instance'
import type { ReferenceListResponseBody } from '@/types/api-responses/lists'
import type { UserProfileCollection } from '@ts-shared/user-profile-collections'

type CollectionRouteListType<Segment extends string> = Extract<
  UserProfileCollection,
  { routeSegment: Segment }
>['routeListType']

type ReferenceList = ReferenceListResponseBody<{ id: string }>

const getReferenceCollection = (
  path: string,
  options?: { searchParams?: Record<string, string | number | undefined> },
): Promise<ReferenceList | null> =>
  returnNullForMissingEntity(serverApi.get<ReferenceList>(path, options), {
    nullStatusCodes: [401, 403, 404],
  })

export const getUserPostBookmarkReferences = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'posts'>,
    options?: { after?: string; limit?: number },
  ): Promise<ReferenceList | null> => {
    const searchParams = { after: options?.after, limit: options?.limit }
    return getReferenceCollection(
      `/api/v1/users/${encodeURIComponent(idOrUsername)}/posts/${encodeURIComponent(listType)}`,
      options?.after || options?.limit ? { searchParams } : undefined,
    )
  },
)

export const getUserTopicBookmarkReferences = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'topics'>,
    options?: { limit?: number },
  ): Promise<ReferenceList | null> =>
    getReferenceCollection(
      `/api/v1/users/${encodeURIComponent(idOrUsername)}/topics/${encodeURIComponent(listType)}`,
      options?.limit ? { searchParams: { limit: options.limit } } : undefined,
    ),
)

export const getUserUserBookmarkReferences = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'users'>,
    options?: { limit?: number },
  ): Promise<ReferenceList | null> =>
    getReferenceCollection(
      `/api/v1/users/${encodeURIComponent(idOrUsername)}/users/${encodeURIComponent(listType)}`,
      options?.limit ? { searchParams: { limit: options.limit } } : undefined,
    ),
)

export const getUserRssFeedBookmarkReferences = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'rss-feeds'>,
    options?: { feedType?: string; limit?: number },
  ): Promise<ReferenceList | null> => {
    const searchParams = { feed_type: options?.feedType, limit: options?.limit }
    return getReferenceCollection(
      `/api/v1/users/${encodeURIComponent(idOrUsername)}/rss-feeds/${encodeURIComponent(listType)}`,
      options?.feedType || options?.limit ? { searchParams } : undefined,
    )
  },
)

export const getUserUrlBookmarkReferences = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'urls'>,
    options?: { limit?: number },
  ): Promise<ReferenceList | null> =>
    getReferenceCollection(
      `/api/v1/users/${encodeURIComponent(idOrUsername)}/urls/${encodeURIComponent(listType)}`,
      options?.limit ? { searchParams: { limit: options.limit } } : undefined,
    ),
)

export const getUserHostnameBookmarkReferences = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'domains'>,
    options?: { limit?: number },
  ): Promise<ReferenceList | null> =>
    getReferenceCollection(
      `/api/v1/users/${encodeURIComponent(idOrUsername)}/domains/${encodeURIComponent(listType)}`,
      options?.limit ? { searchParams: { limit: options.limit } } : undefined,
    ),
)

export const getUserCommunityBookmarkReferences = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'communities'>,
    options?: { limit?: number },
  ): Promise<ReferenceList | null> =>
    getReferenceCollection(
      `/api/v1/users/${encodeURIComponent(idOrUsername)}/communities/${encodeURIComponent(listType)}`,
      options?.limit ? { searchParams: { limit: options.limit } } : undefined,
    ),
)
