'use client'

import { clientApi } from './instance'
import { admissionIdempotency } from './admission-idempotency'
import { assertPathIdentifier } from './path-identifiers'
import type { PostMutationResponseBody } from '@/types/api-responses'
import type { PostBroadcast, PostPrivacy, PostType } from '@/types/posts'

interface CreatePostOptions {
  post_type: PostType
  parent_post_id?: string
  root_post_id?: string
  community_id?: string
  markdown?: string
  title?: string
  review_topic_ratings?: Array<{ topic_id: string; rating: number }>
  broadcast?: PostBroadcast
  privacy?: PostPrivacy
  is_anonymous?: boolean
  images?: Array<{ image_id: string; order_index: number; caption?: string }>
  hp_website?: string
  hp_phone?: string
  cf_turnstile_response?: string
  recaptcha_token?: string
  data_point_vertical?: string
  structured_data?: unknown
  declared_language?: string | null
  categories?: Array<{ type: 'topic'; topic_id: string } | { type: 'hashtag'; hashtag: string }>
}

/**
 * Create a new post or comment
 * POST /api/v1/posts
 */
export async function createPost(options: CreatePostOptions): Promise<PostMutationResponseBody> {
  return createAdmissionControlledPost('/api/v1/posts', options)
}

/**
 * Create a new community-scoped post or cross-post discussion.
 * POST /api/v1/communities/:idOrSlug/posts
 */
export async function createCommunityPost(
  idOrSlug: string,
  options: CreatePostOptions & { community_id: string },
): Promise<PostMutationResponseBody> {
  const safeIdOrSlug = assertPathIdentifier(idOrSlug)
  return createAdmissionControlledPost(
    `/api/v1/communities/${encodeURIComponent(safeIdOrSlug)}/posts`,
    options,
    { route: 'communities.posts.create', community_id: options.community_id, body: options },
  )
}

/**
 * Update an existing post
 * PATCH /api/v1/posts/:id
 */
export async function updatePost(
  id: string,
  changes: {
    title?: string
    markdown?: string
    broadcast?: PostBroadcast
    privacy?: PostPrivacy
    is_anonymous?: boolean
    data_point_vertical?: string
    structured_data?: unknown
    categories?: Array<{ type: 'topic'; topic_id: string } | { type: 'hashtag'; hashtag: string }>
  },
): Promise<PostMutationResponseBody> {
  return clientApi.patch<PostMutationResponseBody>(`/api/v1/posts/${id}`, changes)
}

/**
 * Add a rating to a review post
 * POST /api/v1/posts/:id/ratings
 */
export async function addPostRating(
  postId: string,
  input: { topic_id: string; rating: number; order_index: number },
): Promise<void> {
  await clientApi.post(`/api/v1/posts/${postId}/ratings`, input)
}

/**
 * Update an existing rating on a review post
 * PATCH /api/v1/posts/:id/ratings/:topicId
 */
export async function updatePostRating(
  postId: string,
  topicId: string,
  changes: { rating?: number; order_index?: number },
): Promise<void> {
  await clientApi.patch(`/api/v1/posts/${postId}/ratings/${topicId}`, changes)
}

/**
 * Delete a rating from a review post
 * DELETE /api/v1/posts/:id/ratings/:topicId
 */
export async function deletePostRating(postId: string, topicId: string): Promise<void> {
  await clientApi.delete(`/api/v1/posts/${postId}/ratings/${topicId}`)
}

/**
 * Set images for a post (full replace)
 * PUT /api/v1/posts/:id/images
 */
export async function setPostImages(
  postId: string,
  images: Array<{ image_id: string; order_index: number; caption?: string }>,
): Promise<{
  images: Array<{
    image_id: string
    placement_id: string
    placement_revision: number
    order_index: number
    caption: string
  }>
}> {
  return clientApi.put(`/api/v1/posts/${postId}/images`, { images })
}

/**
 * Create a link post from a URL id or raw URL string.
 * Pass url_id when the URL has already been resolved; pass url for arbitrary user-submitted URLs
 * (the server resolves it to a url_id and triggers a crawl).
 * POST /api/v1/posts
 */
export async function createLinkPost(options: {
  url_id?: string
  url?: string
  title?: string
  markdown?: string
  cf_turnstile_response?: string
}): Promise<PostMutationResponseBody> {
  return createAdmissionControlledPost('/api/v1/posts', {
    post_type: 'link',
    ...options,
  })
}

async function createAdmissionControlledPost(
  endpoint: string,
  body: CreatePostOptions,
  intent: Record<string, unknown> = { endpoint, body },
): Promise<PostMutationResponseBody> {
  return admissionIdempotency.run(intent, idempotencyKey =>
    clientApi.post<PostMutationResponseBody>(endpoint, body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  )
}

export async function deletePost(postIdOrSlug: string): Promise<void> {
  const safe = assertPathIdentifier(postIdOrSlug)
  await clientApi.delete(`/api/v1/posts/${encodeURIComponent(safe)}`)
}

export async function archivePost(postIdOrSlug: string): Promise<PostMutationResponseBody> {
  const safePostIdOrSlug = assertPathIdentifier(postIdOrSlug)
  return clientApi.patch<PostMutationResponseBody>(
    `/api/v1/posts/${encodeURIComponent(safePostIdOrSlug)}`,
    { archive: true },
  )
}

export async function unarchivePost(postIdOrSlug: string): Promise<PostMutationResponseBody> {
  const safePostIdOrSlug = assertPathIdentifier(postIdOrSlug)
  return clientApi.patch<PostMutationResponseBody>(
    `/api/v1/posts/${encodeURIComponent(safePostIdOrSlug)}`,
    { archive: false },
  )
}
