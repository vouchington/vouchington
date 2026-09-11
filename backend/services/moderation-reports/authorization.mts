import type { PrivateUser } from '@services/users/types'

export function currentUserCanResolveModerationReport(currentUser: PrivateUser | null): boolean {
  return (
    (currentUser?.roles?.includes('administrator') ?? false) ||
    (currentUser?.roles?.includes('moderator') ?? false)
  )
}
