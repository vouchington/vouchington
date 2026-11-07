'use client'

/**
 * Posts API methods
 */

import { clientApi } from './instance'
import { assertPathIdentifier } from './path-identifiers'
import { returnNullForMissingEntity } from '../return-null-for-missing-entity'
import type { PostResponseBody, PostsResponseBody } from '@/types/api-responses'
import type { PostType } from '@/types/posts'

interface FetchPostsOptions {
  q?: string // Search query
  post_types?: PostType[] // Filter by post types
  topics?: string[] // Filter by related topics
  review_topic?: string // Filter reviews by topic
  creator?: string // Filter by creator (id or username)
  data_point_vertical?: string // Filter data_point posts by vertical
  sort?: 'new' | 'best' | 'relevance' // Sort order
  limit?: number // Results per page (default: 25)
  after?: string // Cursor for pagination
  /** Embedding-ranked semantic search query; blended with q when both present. */
  semantic_search_query?: string
  /** Search window; the API searches 30 days when omitted. Pickers pass 'all'. */
  time_range?: '1w' | '1m' | '1y' | 'all'
  signal?: AbortSignal // Request cancellation signal
}

/**
 * Fetch posts with filters and pagination
 * GET /api/v1/posts
 */
export async function fetchPosts(options: FetchPostsOptions = {}): Promise<PostsResponseBody> {
  return clientApi.get<PostsResponseBody>('/api/v1/posts', {
    searchParams: {
      q: options.q,
      post_types: options.post_types?.join(','),
      topics: options.topics?.join(','),
      review_topic: options.review_topic,
      creator: options.creator,
      data_point_vertical: options.data_point_vertical,
      sort: options.sort,
      limit: options.limit,
      after: options.after,
      semantic_search_query: options.semantic_search_query,
      time_range: options.time_range,
    },
    signal: options.signal,
  })
}

export function fetchPost(idOrSlug: string): Promise<PostResponseBody | null> {
  const safe = assertPathIdentifier(idOrSlug)
  return returnNullForMissingEntity(
    clientApi.get<PostResponseBody>(`/api/v1/posts/${encodeURIComponent(safe)}`),
  )
}

export function fetchPostDescendants(
  idOrSlug: string,
  options?: { after?: string; limit?: number },
): Promise<PostsResponseBody> {
  return clientApi.get<PostsResponseBody>(
    `/api/v1/posts/${encodeURIComponent(assertPathIdentifier(idOrSlug))}/descendants`,
    { searchParams: options },
  )
}

export function fetchPostAncestors(
  idOrSlug: string,
  options: { after?: string; limit: number },
): Promise<PostsResponseBody> {
  return clientApi.get<PostsResponseBody>(
    `/api/v1/posts/${encodeURIComponent(assertPathIdentifier(idOrSlug))}/ancestors`,
    { searchParams: options },
  )
}
