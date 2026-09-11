import { hasUnexpiredPlusTier } from '@modules/membership-helpers'
import { getMembershipByUserId } from '@services/memberships'
import type { PrivateUser } from '@services/users/types'

export async function currentUserCanViewModerationTransparency(
  currentUser: PrivateUser,
): Promise<boolean> {
  if (currentUser.roles.includes('administrator')) return true
  const membership = await getMembershipByUserId(currentUser.id)
  return hasUnexpiredPlusTier(membership)
}
