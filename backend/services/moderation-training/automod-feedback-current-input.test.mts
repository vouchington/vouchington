import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestAgent,
  createTestUser,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
  setTestPostClearanceStatus,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { recordAutomodActionFeedback } from './automod-feedback.mts'
import { searchRecentAutomodActions } from './recent-actions.mts'

// Uses insertTestPost (raw insert) rather than @services/posts' createPost: communities
// depends on moderation-training (forward), so a moderation-training->posts devDependency
// combined with posts->communities would form a 3-cycle. This suite only asserts on
// searchRecentAutomodActions/recordAutomodActionFeedback behavior, not on createPost's
// real write-path side effects.
//
// Uses createTestAgent (raw insert into agents/agents__moderators) rather than
// @services/moderation's createPostLLMModerator/updatePostLLMModerator: moderation depends on
// communities (forward), and communities depends on moderation-training (forward), so a
// moderation-training->moderation devDependency would complete a 3-cycle.
describe('automod feedback current input matching', () => {
  it('rejects stale agent moderation feedback after content changes', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `training-current-input-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const moderator = await createTestAgent({
      agentType: 'moderator',
      slug: `training-current-input-${random}`,
      activated: true,
    })
    const promptId = await insertTestAgentPrompt({ agentId: moderator.id })
    const postId = await insertTestPost({
      title: `Current input candidate ${random}`,
      slug: `current-input-candidate-${random}`,
      createdById: owner.id,
      markdown: `Current input candidate ${random}.`,
      communityId: community.id,
    })
    await setTestPostClearanceStatus(postId, 'rejected')
    const staleModerationId = await insertTestAgentModeration({
      postId,
      agentId: moderator.id,
      promptId,
      flagged: true,
      inputSha256: Buffer.alloc(32, 7),
      results: { flagged: true, reason: 'Old content', confidence_score: 0.4 },
    })

    const actions = await searchRecentAutomodActions(community.id, {
      sourceType: 'agent_moderation',
      limit: 5,
    })

    expect(actions.actions.map(item => item.agent_moderation_id)).not.toContain(staleModerationId)
    await expect(
      recordAutomodActionFeedback({
        communityId: community.id,
        sourceKey: `agent_moderation:${staleModerationId}`,
        actorUserId: owner.id,
        outcome: 'false_positive',
        action: 'reinstate',
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('uses the latest current-input community prompt moderation for the unpublish', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `training-current-prompt-${random}`,
    })
    const olderPrompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'unpublish',
    })
    const currentPrompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'unpublish',
    })
    const postId = await insertTestPost({
      title: `Current prompt candidate ${random}`,
      slug: `current-prompt-candidate-${random}`,
      createdById: owner.id,
      markdown: `Current prompt candidate ${random}.`,
      communityId: community.id,
      postType: 'discussion',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: owner.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })
    const olderModerationId = await insertTestAgentModeration({
      postId,
      agentId: olderPrompt.agent_id,
      promptId: olderPrompt.id,
      flagged: true,
      results: { flagged: true, reason: 'Older unpublish', confidence_score: 0.3 },
    })
    const currentModerationId = await insertTestAgentModeration({
      postId,
      agentId: currentPrompt.agent_id,
      promptId: currentPrompt.id,
      flagged: true,
      results: { flagged: true, reason: 'Current unpublish', confidence_score: 0.4 },
    })

    const actions = await searchRecentAutomodActions(community.id, {
      sourceType: 'community_prompt',
      limit: 5,
    })

    expect(actions.actions.map(item => item.agent_moderation_id)).not.toContain(olderModerationId)
    expect(actions.actions.map(item => item.agent_moderation_id)).toContain(currentModerationId)
    await expect(
      recordAutomodActionFeedback({
        communityId: community.id,
        sourceKey: `community_prompt:${olderModerationId}`,
        actorUserId: owner.id,
        outcome: 'false_positive',
        action: 'reinstate',
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
