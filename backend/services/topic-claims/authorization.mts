import type { PrivateUser } from '@services/users/types'
import { getVerifiedTopicClaim } from './get.mts'

export function currentUserCanClaimTopic(currentUser: PrivateUser): boolean {
  return currentUser.id !== null
}

export function currentUserCanReviewTopicClaims(currentUser: PrivateUser): boolean {
  return (
    (currentUser.roles?.includes('administrator') ?? false) ||
    (currentUser.roles?.includes('moderator') ?? false)
  )
}

export async function currentUserCanDisputeReviewsOfTopic(
  currentUser: PrivateUser,
  topicId: string,
): Promise<boolean> {
  const claim = await getVerifiedTopicClaim(topicId, currentUser.id)
  return claim !== null
}
