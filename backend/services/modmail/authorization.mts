import type { PrivateUser } from '@services/users/types'
import type { Community, CommunityMember } from '@services/communities/types'
import { currentUserCanModerateCommunity } from '@services/communities/authorization'
import { isModerationStaff } from '@services/users'

export function currentUserCanViewModmailThread(
  currentUser: PrivateUser | null,
  community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  return (
    isModerationStaff(currentUser) ||
    currentUserCanModerateCommunity(currentUser, community, membership)
  )
}

export function currentUserCanOpenModmailThread(
  currentUser: PrivateUser | null,
  _community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  if (isModerationStaff(currentUser)) return true
  return !!membership && !membership.removed_at
}

export function currentUserCanManageSavedReplies(
  currentUser: PrivateUser | null,
  community: Community,
  membership?: CommunityMember | null,
): boolean {
  if (!currentUser) return false
  return (
    isModerationStaff(currentUser) ||
    currentUserCanModerateCommunity(currentUser, community, membership)
  )
}
