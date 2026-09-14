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
import { openAiSpendCapConfig } from '@services/ai-usage'

describe('POST /api/v1/communities/:slug/automod/simulate', () => {
  it('returns 401 for unauthenticated users', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({
      createdById: user.id,
      slug: `automod-sim-401-${createRandomString(8)}`,
    })

    const request = createRequest()
    await request
      .post(`/api/v1/communities/${community.slug}/automod/simulate`)
      .set('Content-Type', 'application/json')
      .send({ prompt_id: 'prompt-1' })
      .expect(401)
  })

  it('returns 403 for non-moderator community members', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `automod-sim-403-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: member!.id })

    const request = createRequest()
    await request.authenticateAs(member!)
    await request
      .post(`/api/v1/communities/${community.slug}/automod/simulate`)
      .set('Content-Type', 'application/json')
      .send({ prompt_id: 'prompt-1' })
      .expect(403)
  })

  it('returns 422 when prompt_id is missing', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `automod-sim-422-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .post(`/api/v1/communities/${community.slug}/automod/simulate`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(422)
  })

  it('returns 422 when simulation options are invalid', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `automod-sim-invalid-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: false,
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .post(`/api/v1/communities/${community.slug}/automod/simulate`)
      .set('Content-Type', 'application/json')
      .send({ prompt_id: prompt.id, time_window_hours: 7 })
      .expect(422)
  })

  it('returns an empty dry-run result for a valid prompt with no approved sample', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `automod-sim-ok-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: false,
      onFlagAction: 'unpublish',
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const res = await request
      .post(`/api/v1/communities/${community.slug}/automod/simulate`)
      .set('Content-Type', 'application/json')
      .send({ prompt_id: prompt.id, time_window_hours: 24, limit: 5 })
      .expect(200)

    expect(res.body.simulation).toMatchObject({
      prompt_id: prompt.id,
      time_window_hours: 24,
      sample_count: 0,
      would_flag_count: 0,
      would_unpublish_count: 0,
      false_positive_estimate: {
        historical_flagged_count: 0,
        historical_approved_count: 0,
        rate: null,
      },
    })
    expect(res.body.results).toEqual([])
  })

  it('omits saved prompt false-positive history for draft prompt overrides', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `automod-sim-draft-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: false,
      onFlagAction: 'unpublish',
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const res = await request
      .post(`/api/v1/communities/${community.slug}/automod/simulate`)
      .set('Content-Type', 'application/json')
      .send({ prompt_id: prompt.id, prompt: 'Draft prompt override', time_window_hours: 24 })
      .expect(200)

    expect(res.body.simulation.false_positive_estimate).toBeNull()
  })

  it('returns 429 and does not call the agent when the daily spend cap is breached', async () => {
    await openAiSpendCapConfig.waitForInitialization()
    // 0 is the true kill-switch value (#8773 review round 4): totalMicrounits is never negative, so
    // this breaches on the very first call regardless of what other tests have written today.
    const restoreConfig = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      daily_cap_microunits: 0,
    })
    // Mocked (not spied-through): if the posts.length guard ever regresses, this must fail the
    // assertion below instead of making a real OpenAI call.
    const simulateSpy = vi
      .spyOn(communityModeration, 'simulateCommunityPromptOnPosts')
      .mockResolvedValue([])
    try {
      const owner = await createTestUser()
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `automod-sim-429-${createRandomString(8)}`,
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
      // The cap check only guards requests that would actually call OpenAI (#9348 review round 10):
      // a matching post is required here so this test still exercises the breach path.
      const postId = await insertTestPost({
        title: `Automod cap check ${createRandomString(8)}`,
        slug: `automod-sim-429-post-${createRandomString(8)}`,
        markdown: 'Post body for spend-cap breach simulation',
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

      expect(simulateSpy).not.toHaveBeenCalled()
    } finally {
      simulateSpy.mockRestore()
      restoreConfig()
    }
  })

  it('returns 200 for an empty simulation even when the daily spend cap is breached', async () => {
    await openAiSpendCapConfig.waitForInitialization()
    // No posts means simulateCommunityPromptOnPosts() never calls OpenAI (simulate.mts:54), so the
    // cap check must be skipped entirely -- a breached cap must not 429 a request that would never
    // have incurred any spend.
    const restoreConfig = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
      daily_cap_microunits: 0,
    })
    try {
      const owner = await createTestUser()
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `automod-sim-empty-cap-${createRandomString(8)}`,
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

      const request = createRequest()
      await request.authenticateAs(owner)
      const res = await request
        .post(`/api/v1/communities/${community.slug}/automod/simulate`)
        .set('Content-Type', 'application/json')
        .send({ prompt_id: prompt.id })
        .expect(200)

      expect(res.body.simulation.sample_count).toBe(0)
    } finally {
      restoreConfig()
    }
  })
})
