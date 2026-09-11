import type { PrivateUser } from '@services/users/types'
import type { Community, CommunityMember } from '@services/communities/types'
import type { Membership } from '@services/memberships/types'
import { hasUnexpiredPlusTier } from '@modules/membership-helpers'

/**
 * Returns true if the current user is an owner or moderator of the community (or an admin).
 */
export function currentUserIsCommunityModerator(
  currentUser: PrivateUser | null,
  _community: Community,
  membership: CommunityMember | null | undefined,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return (
    !membership?.removed_at && (membership?.role === 'owner' || membership?.role === 'moderator')
  )
}

/**
 * Can create/manage prompts: owner or moderator of the community
 */
export function currentUserCanManageCommunityPrompts(
  currentUser: PrivateUser | null,
  _community: Community,
  membership: CommunityMember | null | undefined,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return (
    !membership?.removed_at && (membership?.role === 'owner' || membership?.role === 'moderator')
  )
}

/**
 * Can view moderation results:
 * - owner/moderator of community (any plan)
 * - active Plus+ member of that community
 */
export function currentUserCanViewCommunityModerationResults(
  currentUser: PrivateUser | null,
  _community: Community,
  membership: CommunityMember | null | undefined,
  activeMembership: Membership | null | undefined,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  const isModerator =
    !membership?.removed_at && (membership?.role === 'owner' || membership?.role === 'moderator')
  if (isModerator) return true

  // Plus+ members of this community can view results (active/past_due status only)
  if (membership && !membership.removed_at) {
    return hasUnexpiredPlusTier(activeMembership ?? null)
  }

  return false
}
