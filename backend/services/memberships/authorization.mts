import type { PrivateUser } from '@voucha/types/entities/user'
import type { Membership } from './types.mts'

export function currentUserCanViewMembership(
  currentUser: PrivateUser | null,
  targetUserId: string,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === targetUserId
}

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
