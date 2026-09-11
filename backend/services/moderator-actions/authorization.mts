import type { PrivateUser } from '@voucha/types/entities/user'
import type { Community, CommunityMember } from '@voucha/types/entities/community'

// Inlined role check (rather than importing a helper from @services/users) so this file only
// needs the role list off the caller-supplied user object, keeping this package free of any
// @services/users edge (that package depends on @services/moderator-actions).
function isModerationStaff(currentUser: { roles: readonly string[] }): boolean {
  return currentUser.roles.includes('administrator') || currentUser.roles.includes('moderator')
}

export function currentUserCanViewCommunityModlog(
  currentUser: PrivateUser,
  _community: Community,
  membership: CommunityMember | null | undefined,
): boolean {
  if (isModerationStaff(currentUser)) return true
  if (!membership || membership.removed_at != null) return false
  return membership.role === 'owner' || membership.role === 'moderator'
}
