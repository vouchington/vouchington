import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityInvite,
} from '@voucha/test-helpers'
import { redeemInviteCode } from './redeem.mts'
import { revokeInvite } from './revoke.mts'
import { archiveCommunity } from '../archive.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../types.mts'

describe('index', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  describe('revokeInvite', () => {
    it('owner can revoke a pending invite', async () => {
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      await revokeInvite(owner.id, invite.id)

      // Redeeming the code should now fail
      await expect(redeemInviteCode(invitee.id, invite.code)).rejects.toMatchObject({ status: 404 })
    })

    it('non-mod cannot revoke', async () => {
      const member = await createTestUser()
      await insertTestCommunityMember({ communityId: community.id, userId: member.id })
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      await expect(revokeInvite(member.id, invite.id)).rejects.toMatchObject({ status: 403 })
    })

    it('rejects archived communities', async () => {
      const archivedCommunity = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({
        communityId: archivedCommunity.id,
        userId: owner.id,
        role: 'owner',
      })
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: archivedCommunity.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      await archiveCommunity(archivedCommunity.id, null)

      await expect(revokeInvite(owner.id, invite.id)).rejects.toMatchObject({ status: 403 })
    })
  })
})
