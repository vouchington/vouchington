import type { PrivateUser } from '@services/users/types'

export function currentUserCanCreateTopic(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanUpdateTopic(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanManageTopicAliases(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanMergeTopic(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}
