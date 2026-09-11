import { it, expect, describe, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import { deactivateCommunityPromptsForUser } from './deactivate-for-user.mts'
import { getCommunityAgentPrompt } from './get.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('deactivate-for-user', () => {
  let user: PrivateUser
  let community: Community

  beforeAll(async () => {
    user = await createTestUser()
    community = await insertTestCommunity({ createdById: user.id })
  })

  describe('deactivateCommunityPromptsForUser', () => {
    it('deactivates all allocated prompts for user in community', async () => {
      const [p1, p2] = await Promise.all([
        insertTestCommunityAgentPrompt({
          communityId: community.id,
          createdById: user.id,
          slotAllocated: true,
        }),
        insertTestCommunityAgentPrompt({
          communityId: community.id,
          createdById: user.id,
          slotAllocated: true,
        }),
      ])

      await deactivateCommunityPromptsForUser(user.id, user.id, community.id)

      const [r1, r2] = await Promise.all([
        getCommunityAgentPrompt(p1.id),
        getCommunityAgentPrompt(p2.id),
      ])
      expect(r1!.slot_allocated).toBe(false)
      expect(r1!.deactivated_at).not.toBeNull()
      expect(r1!.activated_at).toBeNull()
      expect(r2!.slot_allocated).toBe(false)
      expect(r2!.deactivated_at).not.toBeNull()
    })

    it('does not affect unallocated prompts', async () => {
      const c = await insertTestCommunity({ createdById: user.id })
      const unallocated = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: user.id,
      })

      await deactivateCommunityPromptsForUser(user.id, user.id, c.id)

      const fetched = await getCommunityAgentPrompt(unallocated.id)
      expect(fetched!.slot_allocated).toBe(false)
      expect(fetched!.deactivated_at).toBeNull()
    })

    it('does not affect prompts in other communities', async () => {
      const communityA = await insertTestCommunity({ createdById: user.id })
      const communityB = await insertTestCommunity({ createdById: user.id })

      const promptInA = await insertTestCommunityAgentPrompt({
        communityId: communityA.id,
        createdById: user.id,
        slotAllocated: true,
      })

      await deactivateCommunityPromptsForUser(user.id, user.id, communityB.id)

      // promptInA should be unaffected
      const fetched = await getCommunityAgentPrompt(promptInA.id)
      expect(fetched!.slot_allocated).toBe(true)
    })

    it('does not affect prompts owned by other users', async () => {
      const otherUser = await createTestUser()
      const c = await insertTestCommunity({ createdById: user.id })
      const promptByOther = await insertTestCommunityAgentPrompt({
        communityId: c.id,
        createdById: otherUser.id,
        slotAllocated: true,
      })

      await deactivateCommunityPromptsForUser(user.id, user.id, c.id)

      const fetched = await getCommunityAgentPrompt(promptByOther.id)
      expect(fetched!.slot_allocated).toBe(true)
    })

    it('is a no-op for user with no prompts in community', async () => {
      const emptyUser = await createTestUser()
      const c = await insertTestCommunity({ createdById: emptyUser.id })
      // Should not throw
      await expect(
        deactivateCommunityPromptsForUser(emptyUser.id, emptyUser.id, c.id),
      ).resolves.toBeUndefined()
    })
  })
})
