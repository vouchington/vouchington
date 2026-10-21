import createHttpError from 'http-errors'
import { getPrivateUserByAny } from '@services/users/get'
import { assertNotSuspended } from '@services/users/suspension-guard'
import { loadPostWriteThread } from './write-thread.mts'
import { canViewDelegatedPostsBatch } from './check-delegated-access-batch.mts'
import type { QueryOptions } from '@data-stores/psql'
import { getCommunityOrThrow, type CommunityWithOwner } from '@services/communities/get'
import {
  communityAllowsPostType,
  isCommunityRootPostType,
} from '@services/communities/post-type-settings'
import assert from 'http-assert'

import type { PrivateUser } from '@services/users/types'
import { hasOAuthAccount } from '@services/user-rate-limits/trust-tier'
import { assertCanContribute } from '@services/contribution-gating/assert'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { createCodedError } from '@modules/on-error/create-coded-error'
import {
  OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
  POST_CONTENT_EDIT_WINDOW_EXPIRED,
} from '@modules/on-error/error-codes'
import type { CreatePostInput, Post } from './types.mts'
import type { CommunityMemberRole } from '@services/communities/types'
import { isPlatformAccount } from '@services/users'
import { canViewPost } from './check-privacy-access.mts'
import { getRouteAccessPost, getRoutePostByAnyCached } from './route-access.mts'
import { getCommunityMember } from '@services/communities/members/get'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * `currentUser.membership_plan` comes from `view_current_paid_memberships` on the primary-read
 * private user loaded for this request, so gating needs no second membership lookup.
 */
export async function getAuthorizedPostContributionMembershipPlan(currentUser: PrivateUser) {
  const membershipPlan = currentUser.membership_plan ?? null
  await assertCanContribute(currentUser, { membershipPlan })
  return membershipPlan
}

export function isPostContentEditable(currentUser: PrivateUser, post: Post, now: number): boolean {
  if (currentUser.roles.includes('administrator')) return true
  const createdAt = getDateFromUUIDv7(post.id)
  if (!createdAt) return true
  return now - createdAt.getTime() <= ONE_DAY_MS
}

export function assertPostContentEditable(currentUser: PrivateUser, post: Post, now: number): void {
  if (isPostContentEditable(currentUser, post, now)) return
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
  operation: 'edit' | 'delete' | 'reply',
  options: QueryOptions = { readOnly: false },
  knownPost?: Post,
  knownCommunityMemberRole?: CommunityMemberRole | null,
): Promise<{ post: Post; communityMemberRole: CommunityMemberRole | null }> {
  const { post, nodes, posts } = await loadPostWriteThread(id, options, knownPost)
  if (nodes.some(node => node.post_type === 'topic_recommendation'))
    throw createHttpError(404, 'Post not found')
  const visible = await canViewDelegatedPostsBatch(user, posts, options)
  if (!posts.every(node => visible.get(node.id))) throw createHttpError(404, 'Post not found')
  const communityMemberRole =
    operation === 'delete' && post.community_id && post.post_type === 'comment'
      ? knownCommunityMemberRole !== undefined
        ? knownCommunityMemberRole
        : ((await getCommunityMember(post.community_id, user.id, options))?.role ?? null)
      : null
  if (operation === 'edit' && !currentUserCanUpdatePost(user, post))
    throw createHttpError(403, 'Forbidden')
  if (operation === 'delete' && !currentUserCanDeletePost(user, post, { communityMemberRole }))
    throw createHttpError(403, 'Forbidden')
  return { post, communityMemberRole }
}

export async function assertDelegatedCommunityPostAllowed(
  communityId: string,
  postType: string,
  options: QueryOptions,
  loadedCommunity?: CommunityWithOwner,
): Promise<void> {
  const community = loadedCommunity ?? (await getCommunityOrThrow(communityId, options))
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

/** A post whose read state the caller may change: it exists, is not under a recommendation, and the caller can see it. */
export async function assertPostReadStateTarget(user: PrivateUser, id: string): Promise<void> {
  const { post, root } = await getRoutePostByAnyCached(id)
  assert(post && !post.deleted_at, 404, 'Post not found')
  assert(await getRouteAccessPost(post, root), 404, 'Post not found')
  assert(await canViewPost(user, post), 404, 'Post not found')
}

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
