import type { PrivateUser } from '@services/users/types'

export function currentUserCanReviewVoteIntegrityFlags(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}

export function currentUserCanApplyVoteRingPenalty(currentUser: PrivateUser | null): boolean {
  if (!currentUser) return false
  return currentUser.roles.includes('administrator')
}
