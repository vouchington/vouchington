import type { PrivateUser } from '@services/users/types'

export function currentUserCanResolveReviewDispute(currentUser: PrivateUser | null): boolean {
  return (
    (currentUser?.roles?.includes('administrator') ?? false) ||
    (currentUser?.roles?.includes('moderator') ?? false)
  )
}
