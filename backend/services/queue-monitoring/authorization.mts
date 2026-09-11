import type { PrivateUser } from '@voucha/types/entities/user'

export function currentUserCanAccessQueueStats(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}
