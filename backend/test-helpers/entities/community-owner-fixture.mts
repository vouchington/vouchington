import type { Community } from '@voucha/types/entities/community'
import type { PrivateUser } from '../../services/users/types.mts'
import { insertTestCommunity } from './communities.mts'
import { insertTestCommunityMember } from './community-members.mts'
import { createTestUser } from './users.mts'

export async function createTestOwnerWithPublicAndPrivateCommunities(): Promise<{
  owner: PrivateUser
  publicCommunity: Community
  privateCommunity: Community
}> {
  const owner = await createTestUser()
  const [publicCommunity, privateCommunity] = await Promise.all([
    insertTestCommunity({ createdById: owner.id, visibility: 'public' }),
    insertTestCommunity({ createdById: owner.id, visibility: 'private' }),
  ])
  await Promise.all([
    insertTestCommunityMember({ communityId: publicCommunity.id, userId: owner.id, role: 'owner' }),
    insertTestCommunityMember({
      communityId: privateCommunity.id,
      userId: owner.id,
      role: 'owner',
    }),
  ])
  return { owner, publicCommunity, privateCommunity }
}
