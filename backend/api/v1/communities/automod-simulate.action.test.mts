import { describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { setTestCommunityAutomodAction } from '@voucha/test-helpers/data-stores/psql/classifier-runs/community-moderation-fixture'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import * as communityModeration from '@agents/community-moderation'
import { openAiSpendCapConfig } from '@services/ai-usage'

describe('POST /api/v1/communities/:slug/automod/simulate community action', () => {
  it('states the community action and simulates the whole sample once', async () => {
    await openAiSpendCapConfig.waitForInitialization()
    const restoreConfig = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      enabled: false,
    })
    const simulateSpy = vi
      .spyOn(communityModeration, 'simulateCommunityPromptOnPosts')
      .mockImplementation(async (_prompt, posts) =>
        posts.map((post, index) => ({
          post_id: post.id,
          flagged: index === 0,
          reason: '' as const,
        })),
      )
    try {
      const owner = await createTestUser()
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `automod-sim-action-${createRandomString(8)}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      await setTestCommunityAutomodAction(community.id, 'unpublish')
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
        slotAllocated: false,
      })
      for (const index of [1, 2, 3]) {
        const postId = await insertTestPost({
          title: `Automod simulation sample ${index} ${createRandomString(8)}`,
          slug: `automod-sim-action-post-${index}-${createRandomString(8)}`,
          markdown: `Sample post ${index} for the dry run`,
          createdById: owner.id,
          communityId: community.id,
        })
        await insertTestCommunityPostReview({
          communityId: community.id,
          postId,
          submittedById: owner.id,
        })
      }

      const request = createRequest()
      await request.authenticateAs(owner)
      const res = await request
        .post(`/api/v1/communities/${community.slug}/automod/simulate`)
        .set('Content-Type', 'application/json')
        .send({ prompt_id: prompt.id })
        .expect(200)

      expect(simulateSpy).toHaveBeenCalledOnce()
      expect(simulateSpy.mock.calls[0]![1]).toHaveLength(3)
      expect(res.body.simulation).toMatchObject({
        sample_count: 3,
        would_flag_count: 1,
        community_automod_action: 'unpublish',
      })
      expect(res.body.simulation).not.toHaveProperty('would_unpublish_count')
      expect(res.body.results).toHaveLength(3)
      expect(res.body.results[0]).not.toHaveProperty('would_unpublish')
    } finally {
      simulateSpy.mockRestore()
      restoreConfig()
    }
  })
})
