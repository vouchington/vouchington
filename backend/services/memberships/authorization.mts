import type { PrivateUser } from '@voucha/types/entities/user'

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
