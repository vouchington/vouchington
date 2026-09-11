import type { PrivateUser } from '@services/users/types'

export function currentUserCanAccessUserReferralLinks(
  currentUser: PrivateUser | null,
  userId: string,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === userId
}

export function currentUserCanCreateUserReferralLink(
  currentUser: PrivateUser | null,
  userId: string,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === userId
}

export function currentUserCanUpdateUserReferralLink(
  currentUser: PrivateUser | null,
  link: { user_id: string },
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === link.user_id
}
