import { searchModeratorActions } from '@services/moderator-actions'
import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestAgent,
  getTestPostClearanceState,
  getTestPostPublicationDirtyWorkForScope,
  createTestUser,
  getPostLLMModerations,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  setPostSpamDetectionResults,
  setTestPostClearanceStatus,
  updatePostModerationData,
} from '@voucha/test-helpers'
import { recordAutomodActionFeedback } from './automod-feedback.mts'
import { searchRecentAutomodActions } from './recent-actions.mts'
import { encodeRecentAutomodActionsCursor } from './recent-actions-utils.mts'

// Uses insertTestPost (raw insert) rather than @services/posts' createPost: communities
// depends on moderation-training (forward), so a moderation-training->posts devDependency
// combined with posts->communities would form a 3-cycle. These tests only assert on
// searchRecentAutomodActions/recordAutomodActionFeedback behavior; the one place that
// referenced the created post's title/post_type/created_at feeds an unasserted cursor call.
//
// Uses createTestAgent (raw insert into agents/agents__moderators) rather than
// @services/moderation's createPostLLMModerator/updatePostLLMModerator: moderation depends on
// communities (forward), and communities depends on moderation-training (forward), so a
// moderation-training->moderation devDependency would complete a 3-cycle.
describe('moderation-training feedback coverage', () => {
  it('records OpenAI, spam, duplicate, and in-review keep-removed automod feedback', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `training-feedback-sources-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const openAiInputHash = Buffer.alloc(32, 1).toString('hex')
    const multiOpenAiInputHash = Buffer.alloc(32, 2).toString('hex')

    const openAiPostTitle = `OpenAI flagged ${random}`
    const openAiPostCreatedAt = new Date()
    const openAiPostId = await insertTestPost({
      title: openAiPostTitle,
      slug: `openai-flagged-${random}`,
      createdById: owner.id,
      markdown: `OpenAI flagged ${random}.`,
      communityId: community.id,
      createdAt: openAiPostCreatedAt,
    })
    await setTestPostClearanceStatus(openAiPostId, 'rejected')
    await updatePostModerationData(
      openAiPostId,
      Buffer.alloc(32, 1),
      [{ flagged: true, categories: { spam: true } }],
      true,
    )
    await setPostSpamDetectionResults(openAiPostId, [{ signal: 'spam', score: 0.9, flagged: true }])
    await searchRecentAutomodActions(community.id, {
      sourceType: 'openai_omni',
      after: encodeRecentAutomodActionsCursor({
        source_key: `openai_omni:${openAiPostId}:${openAiInputHash}`,
        source_type: 'openai_omni',
        post_id: openAiPostId,
        community_id: community.id,
        agent_moderation_id: null,
        moderator_slug: null,
        title: openAiPostTitle,
        authored_title: openAiPostTitle,
        declared_language: null,
        lingua_rs_detected_language: null,
        markdown_preview: '',
        post_type: 'discussion',
        post_href: `/discussion/${openAiPostId}`,
        created_at: openAiPostCreatedAt,
        action_at: new Date(),
        confidence_score: null,
        flagged: true,
        reason: null,
        categories: [],
        model_output: null,
        current_state: 'rejected',
        feedback_label: null,
      }),
      limit: 1,
    })
    const openAiFeedback = await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: `openai_omni:${openAiPostId}:${openAiInputHash}`,
      actorUserId: owner.id,
      outcome: 'true_positive',
      action: 'label_only',
    })
    expect(openAiFeedback).toMatchObject({
      source_type: 'openai_omni',
      label: 'true_positive',
    })
    const openAiSpamSourceKey = (
      await searchRecentAutomodActions(community.id, { sourceType: 'spam_detection' })
    ).actions.find(item => item.post_id === openAiPostId)?.source_key
    expect(openAiSpamSourceKey).toBeTruthy()
    const blockedReinstateFeedback = await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: openAiSpamSourceKey!,
      actorUserId: owner.id,
      outcome: 'false_positive',
      action: 'reinstate',
    })
    expect(blockedReinstateFeedback).toMatchObject({
      source_type: 'spam_detection',
      label: 'false_positive',
      applied_action: false,
    })
    expect(await getTestPostClearanceState(openAiPostId)).toMatchObject({
      approved_at: null,
      rejected_at: expect.any(Date),
    })
    await expect(
      recordAutomodActionFeedback({
        communityId: community.id,
        sourceKey: `openai_omni:${openAiPostId}:${openAiInputHash}`,
        actorUserId: owner.id,
        outcome: 'true_positive',
        action: 'label_only',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })

    const multiFalsePostId = await insertTestPost({
      title: `Multi false flagged ${random}`,
      slug: `multi-false-flagged-${random}`,
      createdById: owner.id,
      markdown: `Multi false flagged ${random}.`,
      communityId: community.id,
    })
    await setTestPostClearanceStatus(multiFalsePostId, 'rejected')
    await updatePostModerationData(
      multiFalsePostId,
      Buffer.alloc(32, 2),
      [{ flagged: true, categories: { spam: true } }],
      true,
    )
    await setPostSpamDetectionResults(multiFalsePostId, [
      { signal: 'spam', score: 0.9, flagged: true },
    ])
    const multiSpamSourceKey = (
      await searchRecentAutomodActions(community.id, { sourceType: 'spam_detection' })
    ).actions.find(item => item.post_id === multiFalsePostId)?.source_key
    expect(multiSpamSourceKey).toBeTruthy()
    await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: multiSpamSourceKey!,
      actorUserId: owner.id,
      outcome: 'false_positive',
      action: 'reinstate',
    })
    expect(await getTestPostClearanceState(multiFalsePostId)).toMatchObject({
      rejected_at: expect.any(Date),
    })
    const finalReinstateFeedback = await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: `openai_omni:${multiFalsePostId}:${multiOpenAiInputHash}`,
      actorUserId: owner.id,
      outcome: 'false_positive',
      action: 'reinstate',
    })
    expect(finalReinstateFeedback).toMatchObject({ applied_action: true })
    expect(await getTestPostClearanceState(multiFalsePostId)).toMatchObject({
      approved_at: expect.any(Date),
      rejected_at: null,
      openai_omni_moderation_flagged: true,
      spam_detection_flagged: true,
    })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: multiFalsePostId }),
    ).resolves.toMatchObject({ post_id: multiFalsePostId })
    const afterReinstatedFalsePositive = await searchRecentAutomodActions(community.id, {
      sourceType: 'openai_omni',
    })
    expect(afterReinstatedFalsePositive.stats).toMatchObject({
      total_count: expect.any(Number),
      false_positive_count: expect.any(Number),
    })
    expect(afterReinstatedFalsePositive.stats.false_positive_count).toBeGreaterThanOrEqual(1)

    const spamPostId = await insertTestPost({
      title: `Spam flagged ${random}`,
      slug: `spam-flagged-${random}`,
      createdById: owner.id,
      markdown: `Spam flagged ${random}.`,
      communityId: community.id,
    })
    await setTestPostClearanceStatus(spamPostId, 'rejected')
    await setPostSpamDetectionResults(spamPostId, [{ signal: 'spam', score: 0.9, flagged: true }])
    const spamSourceKey = (
      await searchRecentAutomodActions(community.id, { sourceType: 'spam_detection' })
    ).actions.find(item => item.post_id === spamPostId)?.source_key
    expect(spamSourceKey).toBeTruthy()
    const spamFeedback = await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: spamSourceKey!,
      actorUserId: owner.id,
      outcome: 'true_positive',
      action: 'label_only',
    })
    expect(spamFeedback).toMatchObject({
      source_type: 'spam_detection',
      label: 'true_positive',
    })

    const moderator = await createTestAgent({
      agentType: 'moderator',
      slug: `training-keep-${random}`,
      activated: true,
    })
    const promptId = await insertTestAgentPrompt({ agentId: moderator.id })
    const inReviewPostId = await insertTestPost({
      title: `In review ${random}`,
      slug: `in-review-${random}`,
      createdById: owner.id,
      markdown: `In review ${random}.`,
      communityId: community.id,
    })
    await setTestPostClearanceStatus(inReviewPostId, 'in_review')
    await insertTestAgentModeration({
      postId: inReviewPostId,
      agentId: moderator.id,
      promptId,
      flagged: true,
      results: { flagged: true, reason: 'Needs review', confidence_score: 'bad-score' },
    })
    const moderations = (await getPostLLMModerations(inReviewPostId)) as Array<{ id: string }>
    const moderationId = moderations[0]?.id
    expect(moderationId).toBeTruthy()
    const invalidConfidenceActions = await searchRecentAutomodActions(community.id, {
      sourceType: 'agent_moderation',
    })
    expect(
      invalidConfidenceActions.actions.find(item => item.post_id === inReviewPostId)
        ?.confidence_score,
    ).toBeNull()
    await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: `agent_moderation:${moderationId}`,
      actorUserId: owner.id,
      outcome: 'true_positive',
      action: 'keep_removed',
      note: 'Correct removal.',
    })
    await expect(
      getTestPostPublicationDirtyWorkForScope({ type: 'post', id: inReviewPostId }),
    ).resolves.toMatchObject({ post_id: inReviewPostId })
    const moderatorActions = await searchModeratorActions({
      communityId: community.id,
      actorId: owner.id,
      actionType: 'reject',
      limit: 5,
    })
    expect(moderatorActions.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ post_id: inReviewPostId })]),
    )
  })
})
