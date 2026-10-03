import type { User } from '@/types/user'

export function makeAsideUser(): Pick<User, 'id' | 'roles' | 'account_type' | 'username'> {
  return { id: 'user-1', roles: [], account_type: null, username: 'alice' }
}
