import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { attemptTestPurgeOwnershipTransfer } from '@voucha/test-helpers/user-purge-communities'
import { createUserDeletionRequest } from '../user-deletions/create.mts'
import { getCommunityMember } from './members/get.mts'
import { initiateOwnershipTransfer } from './ownership-transfer.mts'

describe('purge ownership candidate revalidation', () => {
  it.each(['deleted', 'pending-deletion'] as const)(
    'preserves the outer transaction when a selected moderator is now %s',
    async state => {
      const owner = await createTestUserDirect()
      const moderator = await createTestUserDirect()
      const community = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      })
      if (state === 'deleted') await softDeleteUserAt(moderator.id, new Date())
      else await createUserDeletionRequest(moderator.id, moderator.id)
      await expect(
        attemptTestPurgeOwnershipTransfer(community.id, owner.id, moderator.id),
      ).resolves.toEqual({ accepted: false, formerRole: 'owner' })
      await expect(getCommunityMember(community.id, owner.id)).resolves.toMatchObject({
        role: 'owner',
      })
    },
  )

  it('rolls back the shared role transition when its target has a pending deletion request', async () => {
    const owner = await createTestUserDirect()
    const moderator = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    await createUserDeletionRequest(moderator.id, moderator.id)
    await expect(
      initiateOwnershipTransfer(owner.id, community, moderator.id),
    ).rejects.toMatchObject({ status: 422 })
    await expect(getCommunityMember(community.id, owner.id)).resolves.toMatchObject({
      role: 'owner',
    })
    await expect(getCommunityMember(community.id, moderator.id)).resolves.toMatchObject({
      role: 'moderator',
    })
  })
})
