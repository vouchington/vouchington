import type { PrivateUser } from '@services/users/types'

/**
 * Returns true when the current user may update identity-verification data for targetId.
 * Allowed when: the user is updating their own record, or the user is an administrator.
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/identity-verification/README.md`.
 */
export function currentUserCanUpdateIdentityVerification(
  currentUser: PrivateUser,
  targetId: string,
): boolean {
  if (currentUser.id === targetId) return true
  if (currentUser.roles.includes('administrator')) return true
  return false
}
