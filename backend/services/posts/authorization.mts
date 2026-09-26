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
import { isOfficialAccount } from '@services/users'

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
  if (!isOfficialAccount(currentUser) || (postType !== 'review' && postType !== 'data_point'))
    return
  throw createCodedError(
    403,
    'Official accounts cannot create community reviews or data points.',
    OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
  )
}

export function currentUserCanDeletePost(
  currentUser: PrivateUser | null,
  post: Post,
  options?: { communityMemberRole?: CommunityMemberRole | null },
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  if (post.created_by_id === currentUser.id) return true
  // Community moderators/owners can delete community-scoped comments
  if (post.community_id && post.post_type === 'comment' && options?.communityMemberRole) {
    return options.communityMemberRole === 'owner' || options.communityMemberRole === 'moderator'
  }
  return false
}

export function currentUserCanUnpublishFromCommunity(
  currentUser: PrivateUser | null,
  post: Post,
  options?: { communityMemberRole?: CommunityMemberRole | null },
): boolean {
  if (!currentUser) return false
  if (!post.community_id || post.post_type === 'comment') return false
  if (currentUser.roles.includes('administrator')) return true
  return options?.communityMemberRole === 'owner' || options?.communityMemberRole === 'moderator'
}

export function currentUserCanLockPost(
  currentUser: PrivateUser | null,
  post: Post,
  options?: { communityMemberRole?: CommunityMemberRole | null },
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  if (post.created_by_id === currentUser.id) return true
  if (post.community_id && options?.communityMemberRole) {
    return options.communityMemberRole === 'owner' || options.communityMemberRole === 'moderator'
  }
  return false
}

export function currentUserCanCreatePost(currentUser: PrivateUser): boolean {
  if (currentUser.roles.includes('administrator')) return true
  const hasOAuth = hasOAuthAccount(currentUser)
  const hasUsername = !!currentUser.username
  const hasEmail = !!currentUser.email_address
  return hasOAuth || (hasUsername && hasEmail)
}
