import { it, expect, describe, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  createTestMembership,
} from '@voucha/test-helpers'
import { archiveCommunity } from '@services/communities/archive'
import {
  allocateCommunityAgentPromptSlot,
  deallocateCommunityAgentPromptSlot,
} from './allocate.mts'
import { getCommunityAgentPrompt } from './get.mts'
import type { PrivateUser } from '@services/users/types'

describe('allocate', () => {
  let other: PrivateUser

  beforeAll(async () => {
    other = await createTestUser()
  })

  describe('allocateCommunityAgentPromptSlot', () => {
    it('allocates slot for plus member (limit 1)', async () => {
      const plusUser = await createTestUser()
      await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
      const plusCommunity = await insertTestCommunity({ createdById: plusUser.id })
      const p = await insertTestCommunityAgentPrompt({
        communityId: plusCommunity.id,
        createdById: plusUser.id,
      })

      await allocateCommunityAgentPromptSlot(plusUser.id, p.id)

      const fetched = await getCommunityAgentPrompt(p.id)
      expect(fetched!.slot_allocated).toBe(true)
      expect(fetched!.activated_at).not.toBeNull()
      expect(fetched!.deactivated_at).toBeNull()
    })

    it('rejects allocation without a membership', async () => {
      const noMembershipUser = await createTestUser()
      const c = await insertTestCommunity({ createdById: noMembershipUser.id })
      const p = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: noMembershipUser.id,
      })

      await expect(
        allocateCommunityAgentPromptSlot(noMembershipUser.id, p.id),
      ).rejects.toMatchObject({
        status: 403,
      })
    })

    it('rejects allocation by non-creator', async () => {
      const creator = await createTestUser()
      await createTestMembership({ user_id: other.id, plan: 'plus' })
      const c = await insertTestCommunity({ createdById: creator.id })
      const p = await insertTestCommunityAgentPrompt({ communityId: c.id, createdById: creator.id })

      await expect(allocateCommunityAgentPromptSlot(other.id, p.id)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('rejects allocation in archived communities', async () => {
      const plusUser = await createTestUser()
      await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
      const c = await insertTestCommunity({ createdById: plusUser.id })
      const p = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: plusUser.id,
      })
      await archiveCommunity(c.id, plusUser.id)

      await expect(allocateCommunityAgentPromptSlot(plusUser.id, p.id)).rejects.toMatchObject({
        status: 403,
        message: 'Community is archived',
      })
    })

    it('rejects double-allocation of the same prompt', async () => {
      const plusUser = await createTestUser()
      await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
      const c = await insertTestCommunity({ createdById: plusUser.id })
      const p = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: plusUser.id,
      })

      await allocateCommunityAgentPromptSlot(plusUser.id, p.id)
      await expect(allocateCommunityAgentPromptSlot(plusUser.id, p.id)).rejects.toMatchObject({
        status: 422,
      })
    })

    it('enforces slot limit for plus plan (3 slots)', async () => {
      const plusUser = await createTestUser()
      await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
      const [c1, c2, c3, c4] = await Promise.all([
        insertTestCommunity({ createdById: plusUser.id }),
        insertTestCommunity({ createdById: plusUser.id }),
        insertTestCommunity({ createdById: plusUser.id }),
        insertTestCommunity({ createdById: plusUser.id }),
      ])
      const [p1, p2, p3, p4] = await Promise.all([
        insertTestCommunityAgentPrompt({ communityId: c1.id, createdById: plusUser.id }),
        insertTestCommunityAgentPrompt({ communityId: c2.id, createdById: plusUser.id }),
        insertTestCommunityAgentPrompt({ communityId: c3.id, createdById: plusUser.id }),
        insertTestCommunityAgentPrompt({ communityId: c4.id, createdById: plusUser.id }),
      ])

      // Allocate all 3 allowed slots sequentially (each checks current used count)
      await allocateCommunityAgentPromptSlot(plusUser.id, p1.id)
      await allocateCommunityAgentPromptSlot(plusUser.id, p2.id)
      await allocateCommunityAgentPromptSlot(plusUser.id, p3.id)
      await expect(allocateCommunityAgentPromptSlot(plusUser.id, p4.id)).rejects.toMatchObject({
        status: 422,
      })
    })

    it('plus plan allows 3 slots', async () => {
      const premiumUser = await createTestUser()
      await createTestMembership({ user_id: premiumUser.id, plan: 'plus' })
      const [c1, c2, c3] = await Promise.all([
        insertTestCommunity({ createdById: premiumUser.id }),
        insertTestCommunity({ createdById: premiumUser.id }),
        insertTestCommunity({ createdById: premiumUser.id }),
      ])
      const [p1, p2, p3] = await Promise.all([
        insertTestCommunityAgentPrompt({ communityId: c1.id, createdById: premiumUser.id }),
        insertTestCommunityAgentPrompt({ communityId: c2.id, createdById: premiumUser.id }),
        insertTestCommunityAgentPrompt({ communityId: c3.id, createdById: premiumUser.id }),
      ])

      await Promise.all([
        allocateCommunityAgentPromptSlot(premiumUser.id, p1.id),
        allocateCommunityAgentPromptSlot(premiumUser.id, p2.id),
        allocateCommunityAgentPromptSlot(premiumUser.id, p3.id),
      ])

      const results = await Promise.all(
        [p1.id, p2.id, p3.id].map(id => getCommunityAgentPrompt(id)),
      )
      expect(results.every(r => r!.slot_allocated)).toBe(true)
    })
  })

  describe('deallocateCommunityAgentPromptSlot', () => {
    it('deallocates an allocated slot', async () => {
      const plusUser = await createTestUser()
      await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
      const c = await insertTestCommunity({ createdById: plusUser.id })
      const p = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: plusUser.id,
        slotAllocated: true,
      })

      await deallocateCommunityAgentPromptSlot(plusUser.id, p.id)

      const fetched = await getCommunityAgentPrompt(p.id)
      expect(fetched!.slot_allocated).toBe(false)
      expect(fetched!.activated_at).toBeNull()
      expect(fetched!.deactivated_at).not.toBeNull()
    })

    it('rejects deallocation by non-creator', async () => {
      const creator = await createTestUser()
      const c = await insertTestCommunity({ createdById: creator.id })
      const p = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: creator.id,
        slotAllocated: true,
      })

      await expect(deallocateCommunityAgentPromptSlot(other.id, p.id)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('allows deallocation after the community is archived', async () => {
      const plusUser = await createTestUser()
      await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
      const c = await insertTestCommunity({ createdById: plusUser.id })
      const p = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: plusUser.id,
        slotAllocated: true,
      })
      await archiveCommunity(c.id, plusUser.id)

      await deallocateCommunityAgentPromptSlot(plusUser.id, p.id)

      const fetched = await getCommunityAgentPrompt(p.id)
      expect(fetched!.slot_allocated).toBe(false)
      expect(fetched!.activated_at).toBeNull()
      expect(fetched!.deactivated_at).not.toBeNull()
    })

    it('frees a paid slot after archive so it can be reused', async () => {
      const plusUser = await createTestUser()
      await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
      const archivedCommunity = await insertTestCommunity({ createdById: plusUser.id })
      const activeCommunity = await insertTestCommunity({ createdById: plusUser.id })
      const archivedPrompt = await insertTestCommunityAgentPrompt({
        communityId: archivedCommunity.id,
        createdById: plusUser.id,
        slotAllocated: true,
      })
      const reusablePrompt = await insertTestCommunityAgentPrompt({
        communityId: activeCommunity.id,
        createdById: plusUser.id,
      })

      await archiveCommunity(archivedCommunity.id, plusUser.id)
      await deallocateCommunityAgentPromptSlot(plusUser.id, archivedPrompt.id)
      await allocateCommunityAgentPromptSlot(plusUser.id, reusablePrompt.id)

      const fetchedReusablePrompt = await getCommunityAgentPrompt(reusablePrompt.id)
      expect(fetchedReusablePrompt!.slot_allocated).toBe(true)
    })

    it('rejects deallocation of unallocated prompt', async () => {
      const plusUser = await createTestUser()
      const c = await insertTestCommunity({ createdById: plusUser.id })
      const p = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: plusUser.id,
      })

      await expect(deallocateCommunityAgentPromptSlot(plusUser.id, p.id)).rejects.toMatchObject({
        status: 422,
      })
    })
  })
})
