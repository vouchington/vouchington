import type { PrivateUser } from '@voucha/types/entities/user'
import type { Membership } from './types.mts'

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/memberships/README.md`.
 */
export function currentUserCanViewMembership(
  currentUser: PrivateUser | null,
  targetUserId: string,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === targetUserId
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review.
 * Evidence: `docs/overview/architecture/services/memberships/README.md`.
 */
export function currentUserCanCancelMembership(
  currentUser: PrivateUser | null,
  membership: Membership,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === membership.user_id
}

export function currentUserCanGrantMembership(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanViewMembershipHistory(
  currentUser: PrivateUser | null,
  _targetUserId: string,
): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanRefundMembership(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}
