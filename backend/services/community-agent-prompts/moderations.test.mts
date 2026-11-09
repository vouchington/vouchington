import { it, expect, describe, beforeAll } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestPost,
  insertTestAgentModeration,
  type TestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import { searchCommunityAgentModerations } from './moderations.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('moderations', () => {
  let user: PrivateUser
  let community: Community
  let prompt: TestCommunityAgentPrompt
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()
    community = await insertTestCommunity({ createdById: user.id })
    prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user.id,
      slotAllocated: true,
    })

    const r = createRandomString(8)
    postId = await insertTestPost({
      title: `Moderation test post ${r}`,
      slug: `moderation-test-${r}`,
      markdown: 'test',
      createdById: user.id,
    })

    await insertTestAgentModeration({
      postId,
      promptId: prompt.id,
      agentId: prompt.agent_id,
      results: { flagged: true, confidence_score: 0.93, confidence_threshold: 0.8 },
      flagged: true,
    })
  })

  describe('searchCommunityAgentModerations', () => {
    it('returns moderation results for a post in the community', async () => {
      const { results, page_info } = await searchCommunityAgentModerations(postId, community.id, {
        limit: 25,
      })
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(page_info.has_next_page).toBe(false)

      const r = results.find(m => m.community_prompt_id === prompt.id)!
      expect(r).toBeDefined()
      expect(r.post_id).toBe(postId)
      expect(r.community_prompt_id).toBe(prompt.id)
      expect(r.is_flagged).toBe(true)
      expect(r).not.toHaveProperty('results')
      expect(r.created_at).toBeInstanceOf(Date)
    })

    it('returns empty array for post with no moderations in community', async () => {
      const otherUser = await createTestUser()
      const r = createRandomString(8)
      const otherPostId = await insertTestPost({
        title: `Other post ${r}`,
        slug: `other-post-${r}`,
        markdown: 'no moderation',
        createdById: otherUser.id,
      })

      const { results } = await searchCommunityAgentModerations(otherPostId, community.id, {
        limit: 25,
      })
      expect(results).toEqual([])
    })

    it('does not return results from other communities', async () => {
      const otherCommunity = await insertTestCommunity({ createdById: user.id })
      const { results } = await searchCommunityAgentModerations(postId, otherCommunity.id, {
        limit: 25,
      })
      expect(results.map(r => r.community_prompt_id)).not.toContain(prompt.id)
    })

    it('pages by scoped moderation id without duplicates', async () => {
      await Promise.all([
        insertTestAgentModeration({
          postId,
          promptId: prompt.id,
          agentId: prompt.agent_id,
          results: { flagged: false },
          flagged: false,
        }),
        insertTestAgentModeration({
          postId,
          promptId: prompt.id,
          agentId: prompt.agent_id,
          results: { flagged: false },
          flagged: false,
        }),
      ])
      const first = await searchCommunityAgentModerations(postId, community.id, { limit: 1 })
      expect(first.results).toHaveLength(1)
      expect(first.page_info.has_next_page).toBe(true)
      const second = await searchCommunityAgentModerations(postId, community.id, {
        limit: 1,
        after: first.page_info.end_cursor!,
      })
      expect(second.results).toHaveLength(1)
      expect(second.results[0]?.id).not.toBe(first.results[0]?.id)
      const third = await searchCommunityAgentModerations(postId, community.id, {
        limit: 1,
        after: second.page_info.end_cursor!,
      })
      expect(third.results).toHaveLength(1)
      expect(third.page_info.has_next_page).toBe(false)
      expect(
        new Set([...first.results, ...second.results, ...third.results].map(r => r.id)).size,
      ).toBe(3)
      await expect(
        searchCommunityAgentModerations(postId, community.id, {
          limit: 1,
          after: 'invalid',
        }),
      ).rejects.toThrow('Invalid moderation cursor')
      const otherCommunity = await insertTestCommunity({ createdById: user.id })
      await expect(
        searchCommunityAgentModerations(postId, otherCommunity.id, {
          limit: 1,
          after: first.page_info.end_cursor!,
        }),
      ).rejects.toThrow('Invalid moderation cursor')
    })
  })
})
