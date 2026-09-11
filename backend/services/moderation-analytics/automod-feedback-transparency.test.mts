import crypto from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestAgent,
  createTestUser,
  getLatestPostClearanceTransparencyCategories,
  getLatestPostClearanceTransparencyCommunityId,
  getTestCommunityModerationTransparencyRollupCounts,
  getTestModerationTransparencyRollupCount,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestPostClearanceChange,
  setPostSpamDetectionResults,
  setTestPostClearanceStatus,
  updatePostModerationData,
} from '@voucha/test-helpers'
import { recordAutomodActionFeedback } from '@services/moderation-training/automod-feedback'
import { getModerationAnalytics } from './get-moderation-analytics.mts'

describe('automod feedback transparency attribution', () => {
  it('keeps every jointly flagged post-level source when an agent feedback removal is confirmed', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const author = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Automod Feedback Sources ${suffix}`,
      slug: `automod-feedback-sources-${suffix}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const postId = await insertTestPost({
      title: `Feedback Sources ${suffix}`,
      slug: `automod-feedback-sources-post-${suffix}`,
      createdById: author.id,
      markdown: 'flagged post',
      communityId: community.id,
    })
    await setTestPostClearanceStatus(postId, 'in_review')
    await updatePostModerationData(
      postId,
      Buffer.alloc(32, 1),
      [{ flagged: true, categories: { spam: true } }],
      true,
    )
    await setPostSpamDetectionResults(postId, [{ signal: 'spam', score: 0.9, flagged: true }])
    const agent = await createTestAgent({
      agentType: 'moderator',
      slug: `feedback-sources-${suffix}`,
      activated: true,
    })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id })
    const moderationId = await insertTestAgentModeration({
      postId,
      agentId: agent.id,
      promptId,
      flagged: true,
      results: { flagged: true, reason: 'Needs review' },
    })
    await recordAutomodActionFeedback({
      communityId: community.id,
      sourceKey: `agent_moderation:${moderationId}`,
      actorUserId: owner.id,
      outcome: 'true_positive',
      action: 'keep_removed',
    })

    await expect(getLatestPostClearanceTransparencyCategories(postId)).resolves.toEqual([
      'openai_omni',
      'spam_detection',
    ])
    const metrics = await getModerationAnalytics('7d', {
      type: 'community',
      communityId: community.id,
    })
    expect(metrics.automod_performance.sources).toEqual(
      expect.arrayContaining([
        { source_type: 'openai_omni', count: 1 },
        { source_type: 'spam_detection', count: 1 },
      ]),
    )
    expect(metrics.automod_performance.sources).not.toEqual(
      expect.arrayContaining([{ source_type: 'post_clearance_reject', count: 1 }]),
    )
    // Exact counts are safe only because `community` is freshly created — this test's own
    // rejection is the only `automated_moderation` write this community will ever receive.
    await expect(
      getTestCommunityModerationTransparencyRollupCounts({
        communityId: community.id,
        metric: 'automated_moderation',
        categories: ['openai_omni', 'spam_detection'],
      }),
    ).resolves.toEqual({ openai_omni: 1, spam_detection: 1 })
    await expect(getLatestPostClearanceTransparencyCommunityId(postId)).resolves.toBe(community.id)
  })

  it('rolls community-scoped clearance rejections into the community cohort only', async () => {
    const occurredAt = await uniqueTransparencyNow()
    const owner = await createTestUser()
    const author = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const postId = await insertTestPost({
      title: `Community clearance ${crypto.randomUUID()}`,
      slug: `community-clearance-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'community-scoped clearance',
      communityId: community.id,
    })
    await insertTestPostClearanceChange({
      postId,
      status: 'rejected',
      occurredAt,
      moderationTransparencyCategories: ['openai_omni', 'spam_detection'],
    })
    await expect(
      getTestModerationTransparencyRollupCount({
        occurredAt,
        communityId: community.id,
        metric: 'automated_moderation',
        category: 'openai_omni',
      }),
    ).resolves.toBe(1)
    await expect(
      getTestModerationTransparencyRollupCount({
        occurredAt,
        communityId: community.id,
        metric: 'automated_moderation',
        category: 'spam_detection',
      }),
    ).resolves.toBe(1)
    await expect(
      getTestModerationTransparencyRollupCount({
        occurredAt,
        metric: 'automated_moderation',
        category: 'openai_omni',
      }),
    ).resolves.toBeUndefined()
  })
})

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}
