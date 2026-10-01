import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanViewCommunityApplicationQuestions } from '../authorization.mts'
import { getCommunityOrThrow, type CommunityWithOwner } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'

export async function loadCommunityForApplicationQuestions(
  currentUser: PrivateUser | null,
  idOrSlug: string,
): Promise<CommunityWithOwner> {
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = currentUser ? await getCommunityMember(community.id, currentUser.id) : null
  assert(
    await currentUserCanViewCommunityApplicationQuestions(currentUser, community, membership),
    404,
    'Community not found',
  )
  return community
}
