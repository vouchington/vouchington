import type { PrivateUser } from '@voucha/types/entities/user'

export function currentUserCanResolveModerationAppeal(currentUser: PrivateUser | null): boolean {
  return (
    (currentUser?.roles?.includes('administrator') ?? false) ||
    (currentUser?.roles?.includes('moderator') ?? false)
  )
}
