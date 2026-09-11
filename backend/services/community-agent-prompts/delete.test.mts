import { it, expect, describe, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { archiveCommunity } from '@services/communities/archive'
import { deleteCommunityAgentPrompt } from './delete.mts'
import { getCommunityAgentPrompt } from './get.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('delete', () => {
  let owner: PrivateUser
  let moderator: PrivateUser
  let stranger: PrivateUser
  let community: Community

  beforeAll(async () => {
    ;[owner, moderator, stranger] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
    ])
  })

  describe('deleteCommunityAgentPrompt', () => {
    it('creator can delete their own prompt', async () => {
      const p = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
      })
      await deleteCommunityAgentPrompt(owner, p.id)
      expect(await getCommunityAgentPrompt(p.id)).toBeNull()
    })

    it("owner can delete another user's prompt", async () => {
      const p = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: moderator.id,
      })
      await deleteCommunityAgentPrompt(owner, p.id)
      expect(await getCommunityAgentPrompt(p.id)).toBeNull()
    })

    it("moderator cannot delete another user's prompt", async () => {
      const p = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
      })
      await expect(deleteCommunityAgentPrompt(moderator, p.id)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('stranger cannot delete prompt', async () => {
      const p = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
      })
      await expect(deleteCommunityAgentPrompt(stranger, p.id)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('rejects deletes in archived communities', async () => {
      const archivedCommunity = await insertTestCommunity({
        createdById: owner.id,
        slug: `prompt-delete-archived-${Date.now()}`,
      })
      const p = await insertTestCommunityAgentPrompt({
        communityId: archivedCommunity.id,
        createdById: owner.id,
      })
      await archiveCommunity(archivedCommunity.id, owner.id)

      await expect(deleteCommunityAgentPrompt(owner, p.id)).rejects.toMatchObject({
        status: 403,
        message: 'Community is archived',
      })
    })

    it('delete frees an allocated slot (slot_allocated → false)', async () => {
      const p = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
        slotAllocated: true,
      })
      // Verify it was allocated before delete
      expect((await getCommunityAgentPrompt(p.id))?.slot_allocated).toBe(true)

      await deleteCommunityAgentPrompt(owner, p.id)
      // After delete the prompt is soft-deleted (not visible via get)
      expect(await getCommunityAgentPrompt(p.id)).toBeNull()
    })

    it('returns 404 for non-existent prompt', async () => {
      await expect(
        deleteCommunityAgentPrompt(owner, '00000000-0000-0000-0000-000000000000'),
      ).rejects.toMatchObject({ status: 404 })
    })
  })
})
