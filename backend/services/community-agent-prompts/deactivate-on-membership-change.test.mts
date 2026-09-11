import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityAgentPrompt,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { updateMemberRole } from '@services/communities/members/update-role'
import { removeMember } from '@services/communities/members/remove'
import { getCommunityAgentPrompt } from './get.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

// Relocated from backend/services/communities/members/__tests__/index.{test,part-2,part-3}.test.mts.
// @services/community-agent-prompts already depends on @services/communities (deactivate-for-user.mts
// calls it for authorization/membership lookups), so these tests -- which drive membership changes
// via @services/communities and assert the resulting prompt-slot side effect via
// getCommunityAgentPrompt -- belong here. Keeping them under communities' own test suite would
// require communities to depend on community-agent-prompts for the assertion, recreating the
// workspace cycle removed by moving prompt-slot deactivation onto the entity-listeners queue.
describe('deactivateCommunityPromptsForUser via membership changes', () => {
  let owner: PrivateUser
  let publicCommunity: Community

  async function waitForPromptDeactivated(promptId: string): Promise<void> {
    const prompt = await pollUntilNotNull(async () => {
      const p = await getCommunityAgentPrompt(promptId)
      if (p === null) throw new Error(`Prompt ${promptId} not found — was it deleted?`)
      return p.slot_allocated ? null : p
    })
    if (prompt === null)
      throw new Error(`Timed out waiting for prompt ${promptId} to be deactivated`)
  }

  beforeAll(async () => {
    owner = await createTestUser()
    publicCommunity = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({
      communityId: publicCommunity.id,
      userId: owner.id,
      role: 'owner',
    })
  })

  describe('updateMemberRole', () => {
    it('demoting a moderator to member deactivates their allocated prompts', async () => {
      const mod = await createTestUser()
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: mod.id,
        role: 'moderator',
      })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: publicCommunity.id,
        createdById: mod.id,
        slotAllocated: true,
      })

      await updateMemberRole(owner.id, publicCommunity.id, mod.id, 'member')

      await waitForPromptDeactivated(prompt.id)
      const p = await getCommunityAgentPrompt(prompt.id)
      expect(p!.slot_allocated).toBe(false)
      expect(p!.deactivated_at).not.toBeNull()
      expect(p!.activated_at).toBeNull()
    })

    it('demoting a moderator to member does not affect their prompts in other communities', async () => {
      const mod = await createTestUser()
      const ts = Date.now()
      const communityB = await insertTestCommunity({
        createdById: owner.id,
        slug: `demotion-other-community-${ts}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: publicCommunity.id,
          userId: mod.id,
          role: 'moderator',
        }),
        insertTestCommunityMember({ communityId: communityB.id, userId: owner.id, role: 'owner' }),
        insertTestCommunityMember({
          communityId: communityB.id,
          userId: mod.id,
          role: 'moderator',
        }),
      ])
      const [promptA, promptB] = await Promise.all([
        insertTestCommunityAgentPrompt({
          communityId: publicCommunity.id,
          createdById: mod.id,
          slotAllocated: true,
        }),
        insertTestCommunityAgentPrompt({
          communityId: communityB.id,
          createdById: mod.id,
          slotAllocated: true,
        }),
      ])

      await updateMemberRole(owner.id, publicCommunity.id, mod.id, 'member')

      // Wait for the community A prompt to be deactivated
      await waitForPromptDeactivated(promptA.id)

      // Community B prompt should be unaffected
      const pB = await getCommunityAgentPrompt(promptB.id)
      expect(pB!.slot_allocated).toBe(true)
    })

    it('demoting a moderator to member does not affect prompts owned by other moderators', async () => {
      const mod1 = await createTestUser()
      const mod2 = await createTestUser()
      await Promise.all([
        insertTestCommunityMember({
          communityId: publicCommunity.id,
          userId: mod1.id,
          role: 'moderator',
        }),
        insertTestCommunityMember({
          communityId: publicCommunity.id,
          userId: mod2.id,
          role: 'moderator',
        }),
      ])
      const [prompt1, prompt2] = await Promise.all([
        insertTestCommunityAgentPrompt({
          communityId: publicCommunity.id,
          createdById: mod1.id,
          slotAllocated: true,
        }),
        insertTestCommunityAgentPrompt({
          communityId: publicCommunity.id,
          createdById: mod2.id,
          slotAllocated: true,
        }),
      ])

      await updateMemberRole(owner.id, publicCommunity.id, mod1.id, 'member')

      // Wait for mod1's prompt to be deactivated
      await waitForPromptDeactivated(prompt1.id)

      // mod2's prompt should be unaffected
      const p2 = await getCommunityAgentPrompt(prompt2.id)
      expect(p2!.slot_allocated).toBe(true)
    })

    it('promoting a member to moderator does not affect their prompts', async () => {
      const user = await createTestUser()
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: user.id,
        role: 'member',
      })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: publicCommunity.id,
        createdById: user.id,
        slotAllocated: true,
      })

      await updateMemberRole(owner.id, publicCommunity.id, user.id, 'moderator')

      const p = await getCommunityAgentPrompt(prompt.id)
      expect(p!.slot_allocated).toBe(true)
      expect(p!.deactivated_at).toBeNull()
    })
  })

  describe('removeMember', () => {
    it('removing a moderator deactivates their allocated prompt slots', async () => {
      const mod = await createTestUser()
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: mod.id,
        role: 'moderator',
      })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: publicCommunity.id,
        createdById: mod.id,
        slotAllocated: true,
      })

      await removeMember(owner.id, publicCommunity.id, mod.id)

      await waitForPromptDeactivated(prompt.id)
      const p = await getCommunityAgentPrompt(prompt.id)
      expect(p!.slot_allocated).toBe(false)
      expect(p!.deactivated_at).not.toBeNull()
    })
  })
})
