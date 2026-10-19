import assert from 'http-assert'
import { getTopicByAny } from '@services/topics'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import type { TopicClaim } from './config.mts'
import { getTopicClaimById } from './get.mts'

/** The path topic and the claim id must name the same claim, including after a topic merge. */
export async function requireTopicClaimOnTopic(
  idOrSlug: string,
  claimId: string,
): Promise<TopicClaim> {
  const topic = await getTopicByAny(idOrSlug)
  assert(topic, 404, 'Topic not found')
  const claim = await getTopicClaimById(claimId)
  assert(claim, 404, 'Claim not found')
  assert(claim.topic_id === topic.id, 404, 'Claim not found')
  return claim
}

/** Staff may read another claimant's claim on the path topic. Everyone else must own it. */
export async function getReadableTopicClaim(
  currentUser: PrivateUser,
  idOrSlug: string,
  claimId: string,
): Promise<TopicClaim> {
  const claim = await requireTopicClaimOnTopic(idOrSlug, claimId)
  assert(
    isModerationStaff(currentUser) || claim.claimant_user_id === currentUser.id,
    404,
    'Claim not found',
  )
  return claim
}
