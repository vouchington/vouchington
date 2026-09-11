import type { User } from '@/types/user'

export function getDisplayName(user: Pick<User, 'display_account' | 'username'>): string {
  return user.display_account?.name || user.username || 'User'
}

export function isProfileOwner(
  currentUser: Pick<User, 'id' | 'username'> | null | undefined,
  user: Pick<User, 'id' | 'username'>,
): boolean {
  if (!currentUser) return false
  return (
    currentUser.id === user.id ||
    Boolean(
      currentUser.username &&
      user.username &&
      currentUser.username.toLowerCase() === user.username.toLowerCase(),
    )
  )
}
