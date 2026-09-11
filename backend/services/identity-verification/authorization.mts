import type { PrivateUser } from '@services/users/types'

/**
 * Returns true when the current user may update identity-verification data for targetId.
 * Allowed when: the user is updating their own record, or the user is an administrator.
 */
export function currentUserCanUpdateIdentityVerification(
  currentUser: PrivateUser,
  targetId: string,
): boolean {
  if (currentUser.id === targetId) return true
  if (currentUser.roles.includes('administrator')) return true
  return false
}
