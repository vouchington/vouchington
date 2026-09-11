import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  getTestPostClearanceState,
  createTestAgent,
  createTestUser,
  deleteTestPost,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  setTestPostClearanceStatus,
} from '@voucha/test-helpers'
import { searchModeratorActions } from '@services/moderator-actions'
import { recordAutomodActionFeedback } from './automod-feedback.mts'
import { recordModerationTrainingFeedback } from './feedback.mts'
import { searchRecentAutomodActions } from './recent-actions.mts'

// Uses insertTestPost (raw insert) rather than @services/posts' createPost: communities
// depends on moderation-training (forward), so a moderation-training->posts devDependency
// combined with posts->communities would form a 3-cycle. These tests only assert on
// searchRecentAutomodActions/recordAutomodActionFeedback behavior driven by manually-set
// clearance state and agent-moderation rows, not on createPost's real write-path side effects.
//
// Uses createTestAgent (raw insert into agents/agents__moderators) rather than
// @services/moderation's createPostLLMModerator/updatePostLLMModerator: moderation depends on
// communities (forward), and communities depends on moderation-training (forward), so a
// moderation-training->moderation devDependency would complete a 3-cycle.
//
// See moderation-training.part-2.test.mts for the community-prompt (passive/unpublish) flow,
// which shares this setup pattern but not any variables with the agent-moderation flow below.
describe('moderation-training feedback', () => {
  it('finds recent low-confidence agent removals and records explicit moderator feedback', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `training-feedback-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const moderator = await createTestAgent({
      agentType: 'moderator',
      slug: `training-agent-${random}`,
      activated: true,
    })
    const promptId = await insertTestAgentPrompt({ agentId: moderator.id })
    const postId = await insertTestPost({
      title: `Training candidate ${random}`,
      slug: `training-candidate-${random}`,
      createdById: owner.id,
      markdown: `This is a training candidate ${random}.`,
      communityId: community.id,
    })
    await setTestPostClearanceStatus(postId, 'rejected')
    await insertTestAgentModeration({
      postId,
      agentId: moderator.id,
      promptId,
      flagged: true,
      results: {
        flagged: true,
        reason: 'Possible spam',
        confidence_score: 0.33,
      },
    })
    const secondPostId = await insertTestPost({
      title: `Training candidate second ${random}`,
      slug: `training-candidate-second-${random}`,
      createdById: owner.id,
      markdown: `This is another training candidate ${random}.`,
      communityId: community.id,
    })
    await setTestPostClearanceStatus(secondPostId, 'rejected')
    await insertTestAgentModeration({
      postId: secondPostId,
      agentId: moderator.id,
      promptId,
      flagged: true,
      results: {
        flagged: true,
        reason: 'Possible spam',
        confidence_score: 0.44,
      },
    })
    const deletedPostId = await insertTestPost({
      title: `Deleted training candidate ${random}`,
      slug: `training-candidate-deleted-${random}`,
      createdById: owner.id,
      markdown: `Deleted training candidate ${random}.`,
      communityId: community.id,
    })
    await setTestPostClearanceStatus(deletedPostId, 'rejected')
    await insertTestAgentModeration({
      postId: deletedPostId,
      agentId: moderator.id,
      promptId,
      flagged: true,
      results: {
        flagged: true,
        reason: 'Possible spam',
        confidence_score: 0.11,
      },
    })
    await deleteTestPost(deletedPostId)

    const actions = await searchRecentAutomodActions(community.id, {
      agentSlug: moderator.slug,
      postType: 'discussion',
      maxConfidence: 0.5,
      limit: 5,
    })
    const action = actions.actions.find(item => item.post_id === postId)
    expect(action).toMatchObject({
      source_type: 'agent_moderation',
      current_state: 'rejected',
      confidence_score: 0.33,
      reason: 'Possible spam',
      post_href: `/discussion/${postId}`,
    })
    expect(actions.actions.map(item => item.post_id)).not.toContain(deletedPostId)
    expect(actions.stats.total_count).toBeGreaterThanOrEqual(1)

    await recordModerationTrainingFeedback({
      sourceType: 'agent_moderation_vote',
      eventType: 'agent_accuracy_voted',
      label: 'true_positive',
      humanAction: 'vote_up',
      actorUserId: owner.id,
      communityId: community.id,
      postId,
      agentModerationId: action!.agent_moderation_id,
    })
    const afterVote = await searchRecentAutomodActions(community.id, {
      agentSlug: moderator.slug,
      postType: 'discussion',
      maxConfidence: 0.5,
      limit: 5,
    })
    expect(afterVote.actions.find(item => item.post_id === postId)?.feedback_label).toBeNull()

    const firstPage = await searchRecentAutomodActions(community.id, {
      agentSlug: moderator.slug,
      postType: 'discussion',
      maxConfidence: 0.5,
      limit: 1,
    })
    expect(firstPage.hasNextPage).toBe(true)
    expect(firstPage.endCursor).toBeTruthy()
    const secondPage = await searchRecentAutomodActions(community.id, {
      agentSlug: moderator.slug,
      postType: 'discussion',
      maxConfidence: 0.5,
      limit: 1,
      after: firstPage.endCursor,
    })
    expect(secondPage.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ post_id: secondPostId })]),
    )

    const feedback = await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: action!.source_key,
      actorUserId: owner.id,
      outcome: 'false_positive',
      action: 'reinstate',
      reasonCode: 'too_strict',
      note: 'Allowed after review.',
    })

    expect(feedback).toMatchObject({
      source_type: 'agent_moderation',
      event_type: 'automod_reviewed',
      label: 'false_positive',
      human_action: 'reinstate',
      reason_code: 'too_strict',
      note: 'Allowed after review.',
    })

    const postState = await getTestPostClearanceState(postId)
    expect(postState?.approved_at).toBeTruthy()
    expect(postState?.rejected_at).toBeNull()
    const afterAutomodReview = await searchRecentAutomodActions(community.id, {
      agentSlug: moderator.slug,
      postType: 'discussion',
      maxConfidence: 0.5,
      limit: 5,
    })
    expect(afterAutomodReview.actions.map(item => item.post_id)).not.toContain(postId)
    const moderatorActions = await searchModeratorActions({
      communityId: community.id,
      actorId: owner.id,
      actionType: 'approve',
      limit: 5,
    })
    expect(moderatorActions.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ post_id: postId })]),
    )
  })
})
