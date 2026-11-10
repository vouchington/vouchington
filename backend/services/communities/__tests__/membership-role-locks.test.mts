import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityBan,
  insertTestCommunityMember,
  updateTestCommunityMemberRole,
} from '@voucha/test-helpers'
import { getActiveCommunityBan } from '../bans/get.mts'
import { liftCommunityBan } from '../bans/lift.mts'
import { getCommunityMember } from '../members/get.mts'

describe('community membership role locks', () => {
  it('liftCommunityBan rejects a moderator demoted before the lift statement', async () => {
    const { target, community } = await createOwnerAndTarget('member')
    const moderator = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: target.id,
      bannedById: moderator.id,
    })
    await updateTestCommunityMemberRole(community.id, moderator.id, 'member')
    await expect(liftCommunityBan(moderator, community.id, ban.id)).rejects.toMatchObject({
      status: 403,
    })
    const activeBan = await getActiveCommunityBan(community.id, target.id)
    expect(activeBan).not.toBeNull()
    const moderatorMembership = await getCommunityMember(community.id, moderator.id)
    expect(moderatorMembership?.role).toBe('member')
  })
})

async function createOwnerAndTarget(role: 'member' | 'moderator') {
  const [owner, target] = await Promise.all([createTestUser(), createTestUser()])
  const community = await insertTestCommunity({ createdById: owner!.id, visibility: 'public' })
  await Promise.all([
    insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
    insertTestCommunityMember({ communityId: community.id, userId: target!.id, role }),
  ])
  return { owner: owner!, target: target!, community }
}
