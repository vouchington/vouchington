import type { PrivateUser } from '@services/users/types'

export function currentUserCanViewAgents(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}
