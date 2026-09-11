import type { PrivateUser } from '@services/users/types'

export function currentUserCanManageRssFeedCategories(currentUser: PrivateUser): boolean {
  return currentUser.roles.includes('administrator')
}
