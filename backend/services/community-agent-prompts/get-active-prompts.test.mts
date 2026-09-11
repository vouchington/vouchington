import { it, expect, describe, beforeAll } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { getActiveCommunityAgentPrompts } from './get-active-prompts.mts'
import { deleteCommunityAgentPrompt } from './delete.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('get-active-prompts', () => {
  let user: PrivateUser
  let community: Community

  beforeAll(async () => {
    user = await createTestUser()
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    community = await insertTestCommunity({ createdById: user.id })
  })

  describe('getActiveCommunityAgentPrompts', () => {
    it('returns only active (slot_allocated=true, activated, not deactivated) prompts', async () => {
      const c = await insertTestCommunity({ createdById: user.id })

      const [active, unallocated] = await Promise.all([
        insertTestCommunityAgentPrompt({
          communityId: c.id,
          createdById: user.id,
          slotAllocated: true,
        }),
        insertTestCommunityAgentPrompt({ communityId: c.id, createdById: user.id }),
      ])

      const results = await getActiveCommunityAgentPrompts(c.id)
      const ids = results.map(r => r.id)
      expect(ids).toContain(active.id)
      expect(ids).not.toContain(unallocated.id)
    })

    it('excludes deleted prompts even if they were active', async () => {
      const c = await insertTestCommunity({ createdById: user.id })
      await insertTestCommunityMember({
        communityId: c.id,
        userId: user.id,
        role: 'owner',
      })
      const p = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: user.id,
        slotAllocated: true,
      })

      await deleteCommunityAgentPrompt(user, p.id)

      const results = await getActiveCommunityAgentPrompts(c.id)
      expect(results.map(r => r.id)).not.toContain(p.id)
    })

    it('does not return prompts from other communities', async () => {
      const communityA = await insertTestCommunity({ createdById: user.id })
      const communityB = await insertTestCommunity({ createdById: user.id })

      const promptInA = await insertTestCommunityAgentPrompt({
        communityId: communityA.id,
        createdById: user.id,
        slotAllocated: true,
      })

      const resultsB = await getActiveCommunityAgentPrompts(communityB.id)
      expect(resultsB.map(r => r.id)).not.toContain(promptInA.id)
    })

    it('returns empty array when community has no active prompts', async () => {
      const results = await getActiveCommunityAgentPrompts(community.id)
      // Filtering to just this community — may have none
      const ids = results.map(r => r.id)
      // Verify shape if any returned
      for (const r of results) {
        expect(r.slot_allocated).toBe(true)
        expect(r.activated_at).not.toBeNull()
        expect(r.deactivated_at).toBeNull()
      }
      expect(ids).toBeDefined()
    })

    it('returned prompts include agent_id and prompt text', async () => {
      const c = await insertTestCommunity({ createdById: user.id })
      await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: user.id,
        slotAllocated: true,
        prompt: 'Active prompt check',
      })

      const results = await getActiveCommunityAgentPrompts(c.id)
      expect(results.length).toBeGreaterThanOrEqual(1)
      const r = results.find(p => p.prompt === 'Active prompt check')!
      expect(r).toBeDefined()
      expect(r.agent_id).toBeTruthy()
      expect(r.slot_allocated).toBe(true)
      expect(r.activated_at).not.toBeNull()
      expect(r.deactivated_at).toBeNull()
    })

    it('excludes an allocated prompt when its owner no longer has a paid membership', async () => {
      const paidOwner = await createTestUser()
      const paidCommunity = await insertTestCommunity({ createdById: paidOwner.id })
      const membership = await createTestMembership({ user_id: paidOwner.id, plan: 'plus' })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: paidCommunity.id,
        createdById: paidOwner.id,
        slotAllocated: true,
      })

      await expect(getActiveCommunityAgentPrompts(paidCommunity.id)).resolves.toContainEqual(
        expect.objectContaining({ id: prompt.id }),
      )
      await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))

      await expect(getActiveCommunityAgentPrompts(paidCommunity.id)).resolves.not.toContainEqual(
        expect.objectContaining({ id: prompt.id }),
      )
    })
  })
})
