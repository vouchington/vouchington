import type { PrivateUser } from '@services/users/types'
import type { CommunityWithOwner } from '@services/communities/get'
import { currentUserCanViewCommunity } from '@services/communities/authorization'
import { getCommunityMemberBatch } from '@services/communities/members/batch'

/**
 * Filters a batch of communities to those the current viewer is allowed to see.
 * Public communities always pass; private communities require active membership.
 */
export async function filterViewableCommunities(
  currentUser: PrivateUser | null,
  communities: CommunityWithOwner[],
): Promise<CommunityWithOwner[]> {
  if (communities.length === 0) return []
  if (!currentUser) return communities.filter(c => c.visibility === 'public')
  if (currentUser.roles.includes('administrator')) return communities

  const privateCommunityIds: string[] = []
  for (const c of communities) {
    if (c.visibility !== 'public') privateCommunityIds.push(c.id)
  }

  const membershipMap =
    privateCommunityIds.length > 0
      ? await getCommunityMemberBatch(currentUser.id, privateCommunityIds)
      : {}

  return communities.filter(c =>
    currentUserCanViewCommunity(currentUser, c, membershipMap[c.id] ?? null),
  )
}
