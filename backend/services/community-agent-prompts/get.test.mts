import { it, expect, describe, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { getCommunityAgentPrompt, searchCommunityAgentPrompts } from './get.mts'
import { deleteCommunityAgentPrompt } from './delete.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('get', () => {
  let user: PrivateUser
  let community: Community

  beforeAll(async () => {
    user = await createTestUser()
    community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      role: 'owner',
    })
  })

  describe('getCommunityAgentPrompt', () => {
    it('returns prompt by ID', async () => {
      const created = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
        prompt: 'Get test prompt',
      })

      const fetched = await getCommunityAgentPrompt(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.community_id).toBe(community.id)
      expect(fetched!.created_by_id).toBe(user.id)
      expect(fetched!.prompt).toBe('Get test prompt')
      expect(fetched!.agent_id).toBeTruthy()
      expect(fetched!.model_name).toBe('gpt-5.4-nano')
      expect(fetched!.model_provider).toBe('openai')
    })

    it('returns null for non-existent prompt', async () => {
      const result = await getCommunityAgentPrompt('00000000-0000-0000-0000-000000000000')
      expect(result).toBeNull()
    })

    it('returns null for deleted prompt', async () => {
      const created = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: user.id,
      })
      await deleteCommunityAgentPrompt(user, created.id)

      const fetched = await getCommunityAgentPrompt(created.id)
      expect(fetched).toBeNull()
    })
  })

  describe('searchCommunityAgentPrompts', () => {
    it('returns all non-deleted prompts for a community', async () => {
      const otherCommunity = await insertTestCommunity({ createdById: user.id })

      const [p1, p2] = await Promise.all([
        insertTestCommunityAgentPrompt({
          communityId: otherCommunity.id,
          createdById: user.id,
          prompt: 'Prompt A',
        }),
        insertTestCommunityAgentPrompt({
          communityId: otherCommunity.id,
          createdById: user.id,
          prompt: 'Prompt B',
        }),
      ])

      const results = await searchCommunityAgentPrompts(otherCommunity.id)
      const ids = results.map(r => r.id)
      expect(ids).toContain(p1.id)
      expect(ids).toContain(p2.id)
    })

    it('excludes deleted prompts', async () => {
      const otherCommunity = await insertTestCommunity({ createdById: user.id })
      await insertTestCommunityMember({
        communityId: otherCommunity.id,
        userId: user.id,
        role: 'owner',
      })

      const [kept, deleted] = await Promise.all([
        insertTestCommunityAgentPrompt({ communityId: otherCommunity.id, createdById: user.id }),
        insertTestCommunityAgentPrompt({ communityId: otherCommunity.id, createdById: user.id }),
      ])
      await deleteCommunityAgentPrompt(user, deleted.id)

      const results = await searchCommunityAgentPrompts(otherCommunity.id)
      const ids = results.map(r => r.id)
      expect(ids).toContain(kept.id)
      expect(ids).not.toContain(deleted.id)
    })

    it('does not return prompts from other communities', async () => {
      const communityA = await insertTestCommunity({ createdById: user.id })
      const communityB = await insertTestCommunity({ createdById: user.id })

      const promptA = await insertTestCommunityAgentPrompt({
        communityId: communityA.id,
        createdById: user.id,
      })

      const resultsB = await searchCommunityAgentPrompts(communityB.id)
      expect(resultsB.map(r => r.id)).not.toContain(promptA.id)
    })

    it('returns empty array for community with no prompts', async () => {
      const emptyCommunity = await insertTestCommunity({ createdById: user.id })
      const results = await searchCommunityAgentPrompts(emptyCommunity.id)
      expect(results).toEqual([])
    })
  })
})
