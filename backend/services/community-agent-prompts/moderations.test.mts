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
      results: { flagged: true, reason: 'spam detected' },
      flagged: true,
    })
  }, 30_000)

  describe('searchCommunityAgentModerations', () => {
    it('returns moderation results for a post in the community', async () => {
      const results = await searchCommunityAgentModerations(postId, community.id)
      expect(results.length).toBeGreaterThanOrEqual(1)

      const r = results.find(m => m.community_prompt_id === prompt.id)!
      expect(r).toBeDefined()
      expect(r.post_id).toBe(postId)
      expect(r.community_prompt_id).toBe(prompt.id)
      expect(r.flagged).toBe(true)
      expect(r.results.reason).toBe('spam detected')
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

      const results = await searchCommunityAgentModerations(otherPostId, community.id)
      expect(results).toEqual([])
    })

    it('does not return results from other communities', async () => {
      const otherCommunity = await insertTestCommunity({ createdById: user.id })
      const results = await searchCommunityAgentModerations(postId, otherCommunity.id)
      expect(results.map(r => r.community_prompt_id)).not.toContain(prompt.id)
    })

    it('returned results have correct shape', async () => {
      const results = await searchCommunityAgentModerations(postId, community.id)
      for (const r of results) {
        expect(typeof r.id).toBe('string')
        expect(typeof r.post_id).toBe('string')
        expect(typeof r.community_prompt_id).toBe('string')
        expect(typeof r.flagged).toBe('boolean')
        expect(r.results).toBeDefined()
        expect(r.created_at).toBeInstanceOf(Date)
      }
    })
  })
})
