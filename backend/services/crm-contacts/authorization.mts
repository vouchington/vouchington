import type { PrivateUser } from '@services/users/types'

export function currentUserCanManageCrm(currentUser: PrivateUser): boolean {
  return currentUser.roles.includes('administrator')
}
