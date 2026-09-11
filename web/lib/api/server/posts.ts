import { cache } from 'react'
import { serverApi } from './instance'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type {
  EntityFollowContextResponseBody,
  PostsResponseBody,
  PostResponseBody,
} from '@/types/api-responses'

interface GetOptions {
  searchParams?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
}

type GetPostsOptions = GetOptions & {
  q?: string
  post_types?: string
  topics?: string
  review_topic?: string
  creator?: string
  sort?: 'new' | 'best' | 'relevance' | 'following_new'
  limit?: number
  after?: string
}

export const getPosts = cache(async (options: GetPostsOptions = {}): Promise<PostsResponseBody> => {
  const { headers, q, post_types, topics, review_topic, creator, sort, limit, after } = options
  const searchParams = options.searchParams ?? {
    q,
    post_types,
    topics,
    review_topic,
    creator,
    sort,
    limit,
    after,
  }
  return serverApi.get<PostsResponseBody>('/api/v1/posts', { headers, searchParams })
})

export const getPost = cache(
  async (
    idOrSlug: string,
    options?: { headers?: Record<string, string> },
  ): Promise<PostResponseBody | null> => {
    return returnNullForMissingEntity(
      serverApi.get<PostResponseBody>(`/api/v1/posts/${encodeURIComponent(idOrSlug)}`, options),
    )
  },
)

export const getPostAncestors = cache(
  async (
    idOrSlug: string,
    options?: {
      after?: string
      limit?: number
      headers?: Record<string, string>
    },
  ): Promise<PostsResponseBody> => {
    const requestOptions = options
      ? {
          headers: options.headers,
          searchParams: { after: options.after, limit: options.limit },
        }
      : undefined
    return serverApi.get<PostsResponseBody>(
      `/api/v1/posts/${encodeURIComponent(idOrSlug)}/ancestors`,
      requestOptions,
    )
  },
)

export const getPostDescendants = cache(
  async (
    idOrSlug: string,
    options?: {
      after?: string
      limit?: number
      headers?: Record<string, string>
    },
  ): Promise<PostsResponseBody> => {
    const requestOptions = options
      ? {
          headers: options.headers,
          searchParams: { after: options.after, limit: options.limit },
        }
      : undefined
    return serverApi.get<PostsResponseBody>(
      `/api/v1/posts/${encodeURIComponent(idOrSlug)}/descendants`,
      requestOptions,
    )
  },
)

export const getPostFollowContext = cache(async (idOrSlug: string) =>
  returnNullForMissingEntity(
    serverApi.get<EntityFollowContextResponseBody>(
      `/api/v1/posts/${encodeURIComponent(idOrSlug)}/follow-context`,
    ),
  ),
)
