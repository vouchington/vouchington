import type { PrivateUser } from '@services/users/types'
import { isAdminUser, isModeratorUser } from '@services/users/authorization'

export function currentUserCanResolveModerationReport(currentUser: PrivateUser | null): boolean {
  return isAdminUser(currentUser) || isModeratorUser(currentUser)
}
