import type { PrivateUser } from '@services/users/types'
import type { Community, CommunityMember } from '@services/communities/types'

export function currentUserCanSetOwnModeratorVacation(
  _currentUser: PrivateUser | null,
  _community: Community,
  membership: CommunityMember | null | undefined,
): boolean {
  if (!membership || membership.removed_at != null) return false
  return membership.role === 'owner' || membership.role === 'moderator'
}
