import type { PrivateUser } from '@services/users/types'
import type { Community, CommunityMember } from '@services/communities/types'
import { currentUserCanModerateCommunity } from '@services/communities/authorization'
import { isAdminUser } from '@services/users/authorization'

export type CommunityAiAgentEntitlement = {
  allowed: boolean
  reason: string | null
}

export function currentUserCanManageCommunityAiAgents(
  currentUser: PrivateUser | null,
  community: Community,
  membership: CommunityMember | null | undefined,
): boolean {
  if (!currentUser) return false
  return currentUserCanModerateCommunity(currentUser, community, membership)
}

export function getCommunityAiAgentEntitlement(
  currentUser: PrivateUser,
  community: Community,
  membership: CommunityMember | null | undefined,
  isBaseline = false,
): CommunityAiAgentEntitlement {
  if (isBaseline && !isAdminUser(currentUser)) {
    return {
      allowed: false,
      reason: 'Baseline moderators can only be changed by platform administrators.',
    }
  }

  if (!currentUserCanManageCommunityAiAgents(currentUser, community, membership)) {
    return { allowed: false, reason: 'Community moderator access is required.' }
  }

  return { allowed: true, reason: null }
}
