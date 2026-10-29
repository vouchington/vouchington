import type { User } from '@/types/user'

type LabelledUser = {
  display_account?: { name?: string | null } | null
  username?: string | null
}

export function getUserLabel(
  user: LabelledUser | null | undefined,
  deletedUserLabel: string,
): string {
  return user?.display_account?.name || user?.username || deletedUserLabel
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
