import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from '../types.mts'
import type { PostScope } from './community-scope.mts'
import { isUUID } from '@modules/utils'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { POST_THREAD_LOCKED } from '@modules/on-error/error-codes'
import { getPostByAny } from '../get.mts'
import { getCommunityMember } from '@services/communities/members/get'
import { lockAndAssertNotBanned } from '@services/communities/bans/lock'
import { getCommunityPostRestrictionDecision } from '@services/communities/restrictions/enforce'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export async function resolveCommentScope({
  creator,
  options,
  updates,
}: {
  creator: PrivateUser
  options: QueryOptions
  updates: CreatePostInput
}): Promise<PostScope> {
  assert(updates.parent_id, 422, 'parent_id is required for comments')
  assert(isUUID(updates.parent_id), 422, 'Invalid parent_id')
  assert(
    updates.community_id === undefined,
    422,
    'Comments inherit community scope from their parent',
  )
  const parent = await getPostByAny(updates.parent_id, options)
  assert(parent, 422, 'Parent post not found')
  assert(!parent.deleted_at, 422, 'Cannot reply to a deleted post or comment')
  if (parent.locked_at) {
    throw createCodedError(403, 'This thread is locked', POST_THREAD_LOCKED)
  }
  if (parent.root_id) {
    const root = await getPostByAny(parent.root_id, options)
    if (root?.locked_at) {
      throw createCodedError(403, 'This thread is locked', POST_THREAD_LOCKED)
    }
  }
  const communityId = parent.community_id ?? null
  if (communityId) {
    await assertCanCommentOnCommunityPost(creator, parent, communityId, options, updates)
  }
  return {
    communityId,
    parentId: parent.id,
    rootId: parent.root_id ?? parent.id,
  }
}

async function assertCanCommentOnCommunityPost(
  creator: PrivateUser,
  parent: { id: string; post_type: string; root_id: string | null },
  communityId: string,
  options: QueryOptions,
  updates: CreatePostInput,
): Promise<void> {
  await lockAndAssertNotBanned(communityId, creator.id, options)
  const membership = await getCommunityMember(communityId, creator.id, options)
  assert(membership, 403, 'You must be a member of this community to comment in it')
  await getCommunityPostRestrictionDecision({
    communityId,
    currentUser: creator,
    membership,
    updates,
    options,
  })
  const reviewPostId = parent.post_type === 'comment' ? parent.root_id : parent.id
  assert(reviewPostId, 422, 'Parent community post not found')
  const { rows } = await options.query!(sql`/* createPost:comment-community-review */
    SELECT approved_at, rejected_at, unpublished_at
    FROM community_post_reviews
    WHERE community_id = ${communityId}
      AND post_id = ${reviewPostId}
    LIMIT 1
  `)
  const review = rows[0]
  assert(
    review?.approved_at && !review.rejected_at && !review.unpublished_at,
    403,
    'Cannot comment on an unapproved community post',
  )
}
