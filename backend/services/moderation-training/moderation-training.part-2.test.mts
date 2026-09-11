import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  getTestPostClearanceState,
  getTestPostPublicationDirtyWorkForScope,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestAgentModeration,
  insertTestPost,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { recordAutomodActionFeedback } from './automod-feedback.mts'
import { searchRecentAutomodActions } from './recent-actions.mts'

// See moderation-training.test.mts for the agent-moderation flow, which shares this setup
// pattern but not any variables with the community-prompt flow below.
//
// Uses insertTestPost (raw insert) rather than @services/posts' createPost: communities
// depends on moderation-training (forward), so a moderation-training->posts devDependency
// combined with posts->communities would form a 3-cycle. These tests only assert on
// searchRecentAutomodActions/recordAutomodActionFeedback behavior driven by manually-set
// community-post-review state and agent-moderation rows, not on createPost's real
// write-path side effects.
describe('moderation-training feedback', () => {
  it('records community-prompt automod feedback for passive and unpublish prompts', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `training-feedback-prompts-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const passivePrompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'none',
    })
    const unpublishPrompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'unpublish',
    })
    const promptPostId = await insertTestPost({
      title: `Prompt candidate ${random}`,
      slug: `prompt-candidate-${random}`,
      createdById: owner.id,
      markdown: `Prompt candidate ${random}.`,
      postType: 'discussion',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: promptPostId,
      submittedById: owner.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId: promptPostId,
      unpublishedAt: new Date(),
    })
    await insertTestAgentModeration({
      postId: promptPostId,
      agentId: passivePrompt.agent_id,
      promptId: passivePrompt.id,
      flagged: true,
    })
    await insertTestAgentModeration({
      postId: promptPostId,
      agentId: unpublishPrompt.agent_id,
      promptId: unpublishPrompt.id,
      flagged: true,
    })

    const promptActions = await searchRecentAutomodActions(community.id, {
      sourceType: 'community_prompt',
      limit: 5,
    })
    expect(promptActions.actions).toEqual([
      expect.objectContaining({
        post_id: promptPostId,
        community_id: community.id,
        source_type: 'community_prompt',
      }),
    ])
    const promptFeedback = await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: promptActions.actions[0]!.source_key,
      actorUserId: owner.id,
      outcome: 'false_positive',
      action: 'reinstate',
      reasonCode: 'too_strict',
      note: 'Allowed after prompt review.',
    })
    expect(promptFeedback).toMatchObject({
      source_type: 'community_prompt',
      label: 'false_positive',
      human_action: 'reinstate',
    })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: promptPostId }),
    ).resolves.toMatchObject({ post_id: promptPostId })

    const keepPromptPostId = await insertTestPost({
      title: `Prompt keep removed ${random}`,
      slug: `prompt-keep-removed-${random}`,
      createdById: owner.id,
      markdown: `Prompt keep removed ${random}.`,
      postType: 'discussion',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: keepPromptPostId,
      submittedById: owner.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId: keepPromptPostId,
      unpublishedAt: new Date(),
    })
    await insertTestAgentModeration({
      postId: keepPromptPostId,
      agentId: unpublishPrompt.agent_id,
      promptId: unpublishPrompt.id,
      flagged: true,
    })
    const keepPromptActions = await searchRecentAutomodActions(community.id, {
      sourceType: 'community_prompt',
      limit: 5,
    })
    const keepPromptAction = keepPromptActions.actions.find(
      item => item.post_id === keepPromptPostId,
    )
    expect(keepPromptAction).toBeTruthy()
    await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: keepPromptAction!.source_key,
      actorUserId: owner.id,
      outcome: 'true_positive',
      action: 'keep_removed',
    })
    expect(await getTestPostClearanceState(keepPromptPostId)).toMatchObject({
      rejected_at: null,
    })
  })
})
