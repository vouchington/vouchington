import type { PrivateUser } from '@services/users/types'
import { isOwnerOrAdmin } from '@services/users'
import type { SupportThread } from './types.mts'

export function currentUserCanManageSupport(currentUser: PrivateUser | null): boolean {
  return currentUser?.roles.includes('administrator') ?? false
}

export function currentUserCanViewSupportThread(
  currentUser: PrivateUser | null,
  _thread: SupportThread,
  contactUserId: string | null,
): boolean {
  return isOwnerOrAdmin(currentUser, contactUserId)
}

export function currentUserCanCreateSupportThread(currentUser: PrivateUser | null): boolean {
  return currentUser != null
}
