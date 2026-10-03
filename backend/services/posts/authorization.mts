import createHttpError from 'http-errors'
import { getPrivateUserByAny } from '@services/users/get'
import { assertNotSuspended } from '@services/users/suspension-guard'
import { loadPostWriteThread } from './write-thread.mts'
import { canViewPostsBatch } from './check-privacy-access.mts'
import type { QueryOptions } from '@data-stores/psql'
import { getCommunityOrThrow } from '@services/communities/get'
import {
  communityAllowsPostType,
  isCommunityRootPostType,
} from '@services/communities/post-type-settings'
import assert from 'http-assert'

import type { PrivateUser } from '@services/users/types'
import { hasOAuthAccount } from '@services/user-rate-limits/trust-tier'
import { assertCanContribute } from '@services/contribution-gating/assert'
import { getUserActivePlan } from '@services/memberships'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { createCodedError } from '@modules/on-error/create-coded-error'
import {
  OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
  POST_CONTENT_EDIT_WINDOW_EXPIRED,
} from '@modules/on-error/error-codes'
import type { CreatePostInput, Post } from './types.mts'
import type { CommunityMemberRole } from '@services/communities/types'
import { isPlatformAccount } from '@services/users'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export async function getAuthorizedPostContributionMembershipPlan(currentUser: PrivateUser) {
  const membershipPlan = await getUserActivePlan(currentUser.id)
  await assertCanContribute(currentUser, { membershipPlan })
  return membershipPlan
}

export function isPostContentEditable(currentUser: PrivateUser, post: Post): boolean {
  if (currentUser.roles.includes('administrator')) return true
  const createdAt = getDateFromUUIDv7(post.id)
  if (!createdAt) return true
  return Date.now() - createdAt.getTime() <= ONE_DAY_MS
}

export function assertPostContentEditable(currentUser: PrivateUser, post: Post): void {
  if (isPostContentEditable(currentUser, post)) return
  throw createCodedError(
    403,
    'Post title, content, and structured data can no longer be edited after 1 day',
    POST_CONTENT_EDIT_WINDOW_EXPIRED,
  )
}

export function currentUserCanUpdatePost(currentUser: PrivateUser | null, post: Post): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return post.created_by_id === currentUser.id
}

export function assertOfficialAccountCanCreatePost(
  currentUser: PrivateUser,
  postType: CreatePostInput['post_type'],
): void {
  if (!isPlatformAccount(currentUser) || (postType !== 'review' && postType !== 'data_point'))
    return
  throw createCodedError(
    403,
    'Official and automated accounts cannot create community reviews or data points.',
    OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
  )
}

export function currentUserCanDeletePost(
  currentUser: PrivateUser | null,
  post: Post,
  options?: { communityMemberRole?: CommunityMemberRole | null },
): boolean {
  if (currentUserCanUpdatePost(currentUser, post)) return true
  // Community moderation adds deletion authority only for comments.
  return post.post_type === 'comment' && canModerateCommunityPost(currentUser, post, options)
}

export function currentUserCanUnpublishFromCommunity(
  currentUser: PrivateUser | null,
  post: Post,
  options?: { communityMemberRole?: CommunityMemberRole | null },
): boolean {
  if (!currentUser || !post.community_id || post.post_type === 'comment') return false
  if (currentUser.roles.includes('administrator')) return true
  return canModerateCommunityPost(currentUser, post, options)
}

export function currentUserCanLockPost(
  currentUser: PrivateUser | null,
  post: Post,
  options?: { communityMemberRole?: CommunityMemberRole | null },
): boolean {
  if (currentUserCanUpdatePost(currentUser, post)) return true
  return canModerateCommunityPost(currentUser, post, options)
}

export function currentUserCanCreatePost(currentUser: PrivateUser): boolean {
  if (currentUser.roles.includes('administrator')) return true
  const hasOAuth = hasOAuthAccount(currentUser)
  const hasUsername = !!currentUser.username
  const hasEmail = !!currentUser.email_address
  return hasOAuth || (hasUsername && hasEmail)
}

/** Delegated access covers public threads and only the caller's own private records. */
export async function loadWritablePost(
  user: PrivateUser,
  id: string,
  requireOwnership = true,
  options: QueryOptions = { readOnly: false },
): Promise<Post> {
  const { post, nodes, posts } = await loadPostWriteThread(id, options)
  if (requireOwnership && (post.post_type === 'story' || post.post_type === 'topic_recommendation'))
    throw createHttpError(404, 'Post not found')
  if (nodes.some(node => node.post_type === 'topic_recommendation'))
    throw createHttpError(404, 'Post not found')
  const [asOwner, asPublic] = await Promise.all([
    canViewPostsBatch(user, posts, options),
    canViewPostsBatch(null, posts, options),
  ])
  if (
    !posts.every(
      node => asOwner.get(node.id) && (asPublic.get(node.id) || node.created_by_id === user.id),
    )
  )
    throw createHttpError(404, 'Post not found')
  if (requireOwnership && post.created_by_id !== user.id) throw createHttpError(403, 'Forbidden')
  return post
}

export async function assertDelegatedCommunityPostAllowed(
  communityId: string,
  postType: string,
  options: QueryOptions,
): Promise<void> {
  const community = await getCommunityOrThrow(communityId, options)
  assertDelegatedCommunityWritable(community)
  if (postType === 'comment') return
  assert(
    isCommunityRootPostType(postType) && communityAllowsPostType(community, postType),
    403,
    `${postType} posts are not enabled for this community`,
  )
}

function canModerateCommunityPost(
  currentUser: PrivateUser | null,
  post: Post,
  options?: { communityMemberRole?: CommunityMemberRole | null },
): boolean {
  const role = options?.communityMemberRole
  return Boolean(currentUser && post.community_id && (role === 'owner' || role === 'moderator'))
}

/** Recheck the delegated actor while its author lifecycle fence is held. */
export async function assertDelegatedPostActorActive(
  userId: string,
  options: QueryOptions,
): Promise<void> {
  const user = await getPrivateUserByAny(userId, options)
  if (!user) throw createHttpError(401, 'User not found')
  assertNotSuspended(user)
}

export function assertDelegatedCommunityWritable(community: { archived_at: unknown }): void {
  assert(!community.archived_at, 403, 'Community is archived')
}
