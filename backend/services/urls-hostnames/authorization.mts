import type { PrivateUser } from '@voucha/types/entities/user'

export function currentUserCanFilterHostnameModeration(
  currentUser: Pick<PrivateUser, 'roles'> | null | undefined,
): boolean {
  if (!currentUser) return false
  return Array.isArray(currentUser.roles) && currentUser.roles.includes('administrator')
}
