import { isSystemTopicSeedActor } from './seed-import-authority.mts'
import type { PrivateUser } from '@services/users/types'

export function currentUserCanCreateTopic(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator') || isSystemTopicSeedActor(currentUser)
}

export function currentUserCanUpdateTopic(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator') || isSystemTopicSeedActor(currentUser)
}

export function currentUserCanManageTopicAliases(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanMergeTopic(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}
