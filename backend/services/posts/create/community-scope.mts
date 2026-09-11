import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from '../types.mts'
import type { CreatePostDefaults } from './validation.mts'
import { isUUID } from '@modules/utils'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { POST_THREAD_LOCKED } from '@modules/on-error/error-codes'
import { getPostByAny } from '../get.mts'
import { getCommunityMember } from '@services/communities/members/get'
import { getCommunity } from '@services/communities/get'
import { currentUserCanPostInCommunity } from '@services/communities/authorization'
import { lockAndAssertNotBanned } from '@services/communities/bans/lock'
import { getCommunityPostRestrictionDecision } from '@services/communities/restrictions/enforce'
import assert from 'http-assert'
import { resolveCommentScope } from './comment-scope.mts'

export type PostScope = {
  communityId: string | null
  parentId: string | null
  rootId: string | null
}

export async function resolvePostScope({
  creator,
  defaults,
  options,
  updates,
}: {
  creator: PrivateUser
  defaults: CreatePostDefaults
  options: QueryOptions
  updates: CreatePostInput
}): Promise<PostScope> {
  if (defaults.postType === 'comment') {
    return await resolveCommentScope({ creator, options, updates })
  }
  if (updates.community_id !== undefined) {
    return await resolveCommunityPostScope({ creator, defaults, options, updates })
  }
  assert(!updates.parent_id, 422, 'parent_id is only allowed for comments or community discussions')
  return { communityId: null, parentId: null, rootId: null }
}

async function resolveCommunityPostScope({
  creator,
  defaults,
  options,
  updates,
}: {
  creator: PrivateUser
  defaults: CreatePostDefaults
  options: QueryOptions
  updates: CreatePostInput
}): Promise<PostScope> {
  assert(isUUID(updates.community_id!), 422, 'Invalid community_id')
  assert(
    (defaults.broadcast === 'everyone' && defaults.privacy === 'public') ||
      (defaults.broadcast === 'users' && defaults.privacy === 'private'),
    422,
    'Community posts must be public for everyone or private for signed-in users',
  )
  const [community, membership] = await Promise.all([
    getCommunity(updates.community_id!, options),
    getCommunityMember(updates.community_id!, creator.id, options),
  ])
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')
  // Lock + ban check inside the create transaction so a ban committing before the post insert
  // (later in the same transaction) cannot let a banned user's post through.
  await lockAndAssertNotBanned(updates.community_id!, creator.id, options)
  assert(
    currentUserCanPostInCommunity(creator, community, membership),
    403,
    'You cannot post in this community',
  )
  await getCommunityPostRestrictionDecision({
    communityId: community.id,
    currentUser: creator,
    membership,
    updates,
    options,
  })
  assert(
    community.visibility === 'public' ||
      (defaults.broadcast === 'users' && defaults.privacy === 'private'),
    422,
    'Private community posts must be private for signed-in users',
  )
  if (!updates.parent_id) return { communityId: community.id, parentId: null, rootId: null }
  return resolveDiscussInCommunityScope({ communityId: community.id, options, updates })
}

async function resolveDiscussInCommunityScope({
  communityId,
  options,
  updates,
}: {
  communityId: string
  options: QueryOptions
  updates: CreatePostInput
}): Promise<PostScope> {
  assert(
    updates.post_type === 'discussion',
    422,
    'Only discussions can be discussed in a community',
  )
  assert(isUUID(updates.parent_id!), 422, 'Invalid parent_id')
  const sourcePost = await getPostByAny(updates.parent_id!, options)
  assert(sourcePost, 422, 'Source post not found')
  assert(!sourcePost.deleted_at, 422, 'Source post not found')
  assert(!sourcePost.community_id, 422, 'Only global posts can be discussed in a community')
  assert(sourcePost.post_type !== 'comment', 422, 'Comments cannot be discussed in a community')
  assert(!sourcePost.root_id, 422, 'Only root posts can be discussed in a community')
  assert(
    sourcePost.broadcast === 'everyone' && sourcePost.privacy === 'public',
    422,
    'Only globally visible public posts can be discussed in a community',
  )
  assert(
    sourcePost.clearance_status === 'approved',
    422,
    'Only approved posts can be discussed in a community',
  )
  if (sourcePost.locked_at) {
    throw createCodedError(403, 'This thread is locked', POST_THREAD_LOCKED)
  }
  return { communityId, parentId: sourcePost.id, rootId: null }
}
