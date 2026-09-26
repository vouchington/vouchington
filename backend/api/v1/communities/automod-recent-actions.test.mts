import { updateClearanceStatus } from '@services/post-clearance/update-status'
import { createPost } from '@services/posts'
import { createPostLLMModerator, updatePostLLMModerator } from '@services/moderation/moderators'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createSystemUser,
  createTestUser,
  archiveTestCommunity,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestCommunity,
  insertTestCommunityMember,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'

describe('Community automod recent action routes', () => {
  it('requires moderator access', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `automod-access-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member!.id,
      role: 'member',
    })

    const request = createRequest()
    await request.authenticateAs(member!)
    await request.get(`/api/v1/communities/${community.slug}/automod/recent-actions`).expect(403)
  })

  it('returns candidate automod actions and accepts explicit feedback', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `automod-actions-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const systemUser = await createSystemUser(`automod-agent-${random}`)
    const moderator = await createPostLLMModerator(owner, systemUser, `automod-agent-${random}`)
    await updatePostLLMModerator(owner, moderator.id, { active: true })
    const promptId = await insertTestAgentPrompt({ agentId: moderator.id })
    const post = await createPost(WEB_PROVENANCE, owner, {
      title: `Automod route candidate ${random}`,
      markdown: `Automod route candidate body ${random}`,
      post_type: 'discussion',
      community_id: community.id,
    })
    await updateClearanceStatus(post.id, 'rejected')
    await insertTestAgentModeration({
      postId: post.id,
      agentId: moderator.id,
      promptId,
      flagged: true,
      results: {
        flagged: true,
        reason: 'Low quality',
        confidence_score: 0.41,
      },
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const list = await request
      .get(`/api/v1/communities/${community.slug}/automod/recent-actions?agent=${moderator.slug}`)
      .expect(200)
    const action = list.body.automod_actions.find(
      (item: { post_id: string }) => item.post_id === post.id,
    )
    expect(action).toMatchObject({
      source_type: 'agent_moderation',
      current_state: 'rejected',
      reason: 'Low quality',
      post_href: `/discussion/${post.id}`,
      authored_title: `Automod route candidate ${random}`,
      declared_language: null,
      lingua_rs_detected_language: null,
    })
    expect(list.body.stats).toMatchObject({
      total_count: expect.any(Number),
      false_positive_count: expect.any(Number),
      false_positive_rate: expect.any(Number),
    })

    const filtered = await request
      .get(
        `/api/v1/communities/${community.slug}/automod/recent-actions?agent=${moderator.slug}&post_type=review`,
      )
      .expect(200)
    expect(filtered.body.automod_actions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ post_id: post.id })]),
    )

    const parserBranches = await request
      .get(
        `/api/v1/communities/${community.slug}/automod/recent-actions?window=24h&limit=2&source=agent_moderation&max_confidence=0.5`,
      )
      .expect(200)
    expect(parserBranches.body.automod_actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ post_id: post.id })]),
    )
    await request
      .get(
        `/api/v1/communities/${community.slug}/automod/recent-actions?window=7d&limit=bad&source=not_real&post_type=not_real&max_confidence=bad`,
      )
      .expect(200)
    await request
      .get(`/api/v1/communities/${community.slug}/automod/recent-actions?source=community_prompt`)
      .expect(200)
    await request
      .get(`/api/v1/communities/${community.slug}/automod/recent-actions?source=spam_detection`)
      .expect(200)

    const feedback = await request
      .post(
        `/api/v1/communities/${community.slug}/automod/recent-actions/${encodeURIComponent(action.source_key)}/feedback`,
      )
      .send({
        outcome: 'true_positive',
        action: 'keep_removed',
        reason_code: 'correct',
      })
      .expect(201)

    expect(feedback.body.feedback).toMatchObject({
      source_type: 'agent_moderation',
      label: 'true_positive',
      human_action: 'keep_removed',
      reason_code: 'correct',
    })
    expect(feedback.body.applied_action).toBe(true)
  })

  it('rejects feedback writes for archived communities', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `automod-archived-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    await archiveTestCommunity({ communityId: community.id, archivedById: owner.id })

    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .post(
        `/api/v1/communities/${community.slug}/automod/recent-actions/${encodeURIComponent(
          `openai_omni:${community.id}`,
        )}/feedback`,
      )
      .send({ outcome: 'false_positive', action: 'reinstate' })
      .expect(403)
  })
})
