import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { initiateOwnershipTransfer } from '../ownership-transfer.mts'
import { loadCommunityWithViewer } from '../load-with-viewer.mts'
import { getCommunityMember } from './get.mts'
import { leaveCommunity } from './leave.mts'

describe('leaveCommunity', () => {
  it('rechecks ownership after a loaded moderator is promoted', async () => {
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])
    const staleModeratorView = await loadCommunityWithViewer(community.id, moderator.id)

    await initiateOwnershipTransfer(owner.id, community, moderator.id)

    await expect(leaveCommunity(moderator.id, staleModeratorView)).rejects.toMatchObject({
      status: 422,
    })
    await expect(getCommunityMember(community.id, moderator.id)).resolves.toMatchObject({
      role: 'owner',
    })
  })
})
