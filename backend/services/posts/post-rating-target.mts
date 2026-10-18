import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { isUUID } from '@modules/utils'
import { currentUserCanUpdatePost } from './authorization.mts'
import { getRouteAccessPost, getRoutePostByAnyCached } from './route-access.mts'
import type { Post } from './types.mts'

/** The review a caller may rate: readable at its route, theirs to update, and a review. */
export async function loadPostRatingTarget(user: PrivateUser, idOrSlug: string): Promise<Post> {
  const { post, root } = await getRoutePostByAnyCached(idOrSlug)
  assert(post, 404, 'Post not found')
  assert(!post.deleted_at, 404, 'Post not found')
  assert(await getRouteAccessPost(post, root), 404, 'Post not found')
  assert(currentUserCanUpdatePost(user, post), 403, 'Forbidden')
  assert(post.post_type === 'review', 422, 'Post is not a review')
  return post
}

export function assertPostRatingTopicId(topicId: unknown): asserts topicId is string {
  assert(typeof topicId === 'string', 422, 'topic_id must be a string')
  assert(isUUID(topicId), 422, 'Invalid topic_id')
}

export function assertPostRatingValue(rating: unknown): asserts rating is number {
  assert(
    typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 5,
    422,
    'Rating must be an integer between 1 and 5',
  )
}

export function assertPostRatingOrderIndex(orderIndex: unknown): asserts orderIndex is number {
  assert(
    typeof orderIndex === 'number' && Number.isInteger(orderIndex) && orderIndex >= 0,
    422,
    'order_index must be a non-negative integer',
  )
}
