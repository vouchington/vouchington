import type { PrivateUser } from '@services/users/types'
import { isModerationStaff } from '@services/users'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { IDENTITY_REQUIRED } from '@modules/on-error/error-codes'
import { getActiveCommunityBan } from './bans/get.mts'
import { getPendingApplicationForUser } from './applications/pending.mts'
import type { Community, CommunityMember } from './types.mts'

export function currentUserCanUpdateCommunity(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return membership?.role === 'owner'
}

export function currentUserCanDeleteCommunity(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return membership?.role === 'owner'
}

export function currentUserCanModerateCommunity(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return membership?.role === 'owner' || membership?.role === 'moderator'
}

/** Site moderation staff can moderate publications, but not other community settings. */
export function currentUserCanModerateCommunityPublication(
  currentUser: PrivateUser | null,
  community: Community,
  membership?: CommunityMember | null,
): boolean {
  return (
    isModerationStaff(currentUser) ||
    currentUserCanModerateCommunity(currentUser, community, membership)
  )
}

export function currentUserCanPostInCommunity(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return !!membership && !membership.removed_at
}

export function assertCanCreateCommunity(currentUser: PrivateUser): void {
  if (currentUser.roles.includes('administrator')) return
  if (!currentUser.username) {
    throw createCodedError(403, 'A username is required to create a community', IDENTITY_REQUIRED)
  }
}

export function currentUserCanManageCommunityList(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return membership?.role === 'owner' || membership?.role === 'moderator'
}

export function currentUserCanManageCommunityBans(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return membership?.role === 'owner' || membership?.role === 'moderator'
}

export function currentUserCanViewCommunity(
  currentUser: PrivateUser | null,
  community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (community.visibility === 'public') return true
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return !!membership && !membership.removed_at
}

/** Questions also serve prospective applicants accepted by createApplication. */
export async function currentUserCanViewCommunityApplicationQuestions(
  currentUser: PrivateUser | null,
  community: Community,
  membership?: CommunityMember | null,
): Promise<boolean> {
  if (currentUserCanViewCommunity(currentUser, community, membership)) return true
  if (!currentUser || community.visibility !== 'private') return false
  const [ban, pending] = await Promise.all([
    getActiveCommunityBan(community.id, currentUser.id),
    getPendingApplicationForUser(community.id, currentUser.id),
  ])
  // Pending applicants can already view the detail page, including after eligibility changes.
  if (pending) return true
  return !community.archived_at && !membership && !ban
}
