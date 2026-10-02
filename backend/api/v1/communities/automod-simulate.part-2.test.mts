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
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import * as communityModeration from '@agents/community-moderation'
import { OpenAiSpendCapBreachError, openAiSpendCapConfig } from '@services/ai-usage'

describe('POST /api/v1/communities/:slug/automod/simulate spend cap during the run', () => {
  it('returns 429 when the daily spend cap is breached after the pre-check passed', async () => {
    await openAiSpendCapConfig.waitForInitialization()
    const restoreConfig = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      enabled: false,
    })
    // The sample is many calls, so the cap can be reached between the route's one pre-check and a
    // later call; the dry run surfaces that as the breach error, which must answer like the pre-check.
    const simulateSpy = vi
      .spyOn(communityModeration, 'simulateCommunityPromptOnPosts')
      .mockRejectedValue(
        new OpenAiSpendCapBreachError({
          reason: 'cap_exceeded',
          dailyCapMicrounits: 1,
          totalMicrounits: 2,
          day: '2026-10-02',
        }),
      )
    try {
      const owner = await createTestUser()
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `automod-sim-429-mid-${createRandomString(8)}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      const prompt = await insertTestCommunityAgentPrompt({
        communityId: community.id,
        createdById: owner.id,
        slotAllocated: false,
      })
      const postId = await insertTestPost({
        title: `Automod mid-run cap ${createRandomString(8)}`,
        slug: `automod-sim-429-mid-post-${createRandomString(8)}`,
        markdown: 'Post body for a cap reached mid-simulation',
        createdById: owner.id,
        communityId: community.id,
      })
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: owner.id,
      })

      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .post(`/api/v1/communities/${community.slug}/automod/simulate`)
        .set('Content-Type', 'application/json')
        .send({ prompt_id: prompt.id })
        .expect(429)

      expect(simulateSpy).toHaveBeenCalledOnce()
    } finally {
      simulateSpy.mockRestore()
      restoreConfig()
    }
  })
})
