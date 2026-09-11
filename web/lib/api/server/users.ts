import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  CommunitiesListResponseBody,
  HostnamesListResponseBody,
  PostsListResponseBody,
  PublicLandingPageResponseBody,
  RssFeedsListResponseBody,
  TopicsListResponseBody,
  UrlsListResponseBody,
  UserResponseBody,
  UserVouchContextResponseBody,
  UsersListResponseBody,
  UsersSearchResponseBody,
} from '@/types/api-responses'
import type { PublicLandingPage } from '@/types/landing-pages'
import type { UserProfileCollection } from '@ts-shared/user-profile-collections'

type CollectionRouteListType<Segment extends string> = Extract<
  UserProfileCollection,
  { routeSegment: Segment }
>['routeListType']

export const getUserLandingPage = cache(
  async (username: string, slug?: string): Promise<PublicLandingPage | null> => {
    const path = slug
      ? `/api/v1/users/${encodeURIComponent(username)}/landing-pages/${encodeURIComponent(slug)}`
      : `/api/v1/users/${encodeURIComponent(username)}/landing-page`

    return returnNullForMissingEntity(serverApi.get<PublicLandingPageResponseBody>(path))
  },
)

export const GET_USER_PROFILE_WITH_BIO = { includeBio: true } as const
export const getUsersSearchResults = cache(
  async (options: {
    q: string
    after?: string
    limit?: number
  }): Promise<UsersSearchResponseBody> => {
    return serverApi.get<UsersSearchResponseBody>('/api/v1/users', {
      searchParams: { q: options.q, after: options.after, limit: options.limit },
    })
  },
)

export const getUserProfile = cache(
  async (
    idOrUsername: string,
    options?: { headers?: Record<string, string>; includeBio?: boolean },
  ): Promise<UserResponseBody | null> => {
    const { includeBio, ...rest } = options ?? {}
    const qs = includeBio ? '?include_bio=1' : ''
    return returnNullForMissingEntity(
      serverApi.get<UserResponseBody>(
        `/api/v1/users/${encodeURIComponent(idOrUsername)}${qs}`,
        Object.keys(rest).length > 0 ? rest : undefined,
      ),
    )
  },
)

export const getUserTopicsCollection = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'topics'>,
    options?: { limit?: number },
  ): Promise<TopicsListResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<TopicsListResponseBody>(
        `/api/v1/users/${encodeURIComponent(idOrUsername)}/topics/${encodeURIComponent(listType)}`,
        options?.limit ? { searchParams: { limit: options.limit } } : undefined,
      ),
      { nullStatusCodes: [401, 403, 404] },
    )
  },
)

export const getUserUsersCollection = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'users'>,
    options?: { limit?: number },
  ): Promise<UsersListResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<UsersListResponseBody>(
        `/api/v1/users/${encodeURIComponent(idOrUsername)}/users/${encodeURIComponent(listType)}`,
        options?.limit ? { searchParams: { limit: options.limit } } : undefined,
      ),
      { nullStatusCodes: [401, 403, 404] },
    )
  },
)

export const getUserRssFeedsCollection = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'rss-feeds'> = 'following',
    options?: { feedType?: string; limit?: number },
  ): Promise<RssFeedsListResponseBody | null> => {
    const searchParams = { feed_type: options?.feedType, limit: options?.limit }
    return returnNullForMissingEntity(
      serverApi.get<RssFeedsListResponseBody>(
        `/api/v1/users/${encodeURIComponent(idOrUsername)}/rss-feeds/${encodeURIComponent(listType)}`,
        options?.feedType || options?.limit ? { searchParams } : undefined,
      ),
      { nullStatusCodes: listType === 'following' ? [403, 404] : [401, 403, 404] },
    )
  },
)

export const getUserVouchContext = cache(
  async (id: string): Promise<UserVouchContextResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<UserVouchContextResponseBody>(
        `/api/v1/users/${encodeURIComponent(id)}/vouch-context`,
      ),
      { nullStatusCodes: [401, 403, 404] },
    )
  },
)

export { getUserRssFeedItemsCollection } from './rss-feed-items'

export const getUserPostsCollection = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'posts'>,
    options?: { after?: string; limit?: number },
  ): Promise<PostsListResponseBody | null> => {
    const searchParams = { after: options?.after, limit: options?.limit }
    return returnNullForMissingEntity(
      serverApi.get<PostsListResponseBody>(
        `/api/v1/users/${encodeURIComponent(idOrUsername)}/posts/${encodeURIComponent(listType)}`,
        options?.after || options?.limit ? { searchParams } : undefined,
      ),
      { nullStatusCodes: [401, 403, 404] },
    )
  },
)

export const getUserUrlsCollection = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'urls'>,
    options?: { limit?: number },
  ): Promise<UrlsListResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<UrlsListResponseBody>(
        `/api/v1/users/${encodeURIComponent(idOrUsername)}/urls/${encodeURIComponent(listType)}`,
        options?.limit ? { searchParams: { limit: options.limit } } : undefined,
      ),
      { nullStatusCodes: [401, 403, 404] },
    )
  },
)

export const getUserHostnamesCollection = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'domains'>,
    options?: { limit?: number },
  ): Promise<HostnamesListResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<HostnamesListResponseBody>(
        `/api/v1/users/${encodeURIComponent(idOrUsername)}/domains/${encodeURIComponent(listType)}`,
        options?.limit ? { searchParams: { limit: options.limit } } : undefined,
      ),
      { nullStatusCodes: [401, 403, 404] },
    )
  },
)

export const getUserCommunitiesCollection = cache(
  async (
    idOrUsername: string,
    listType: CollectionRouteListType<'communities'>,
    options?: { limit?: number },
  ): Promise<CommunitiesListResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<CommunitiesListResponseBody>(
        `/api/v1/users/${encodeURIComponent(idOrUsername)}/communities/${encodeURIComponent(listType)}`,
        options?.limit ? { searchParams: { limit: options.limit } } : undefined,
      ),
      { nullStatusCodes: [401, 403, 404] },
    )
  },
)
