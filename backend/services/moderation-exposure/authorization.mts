import type { PrivateUser } from '@services/users/types'

/** Any administrator or platform-level moderator may record a media reveal. */
export function currentUserCanRecordReveal(currentUser: PrivateUser): boolean {
  return currentUser.roles.includes('administrator') || currentUser.roles.includes('moderator')
}
