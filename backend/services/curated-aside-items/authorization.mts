import type { PrivateUser } from '@services/users/types'

export function currentUserCanManageCuratedAsides(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}
