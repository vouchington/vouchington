import type { PrivateUser } from '@services/users/types'

export function currentUserCanLiftCopyrightRestriction(currentUser: PrivateUser | null): boolean {
  return currentUser?.roles?.includes('administrator') === true
}

export function currentUserCanReviewCopyrightNotices(currentUser: PrivateUser | null): boolean {
  return (
    currentUser?.roles?.includes('administrator') === true ||
    currentUser?.roles?.includes('moderator') === true
  )
}
