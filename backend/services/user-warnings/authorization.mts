import type { PrivateUser } from '@services/users/types'

export function currentUserCanIssueUserWarning(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator') || currentUser.roles.includes('moderator')
}

export function currentUserCanViewUserWarnings(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator') || currentUser.roles.includes('moderator')
}
