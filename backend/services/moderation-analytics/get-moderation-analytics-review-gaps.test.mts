import { describe, expect, it } from 'vitest'
import {
  approveTestPost,
  createSystemUser,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestModerationAppeal,
  insertTestModeratorAction,
  insertTestPost,
  recordTestPostModerationDisposition,
  insertTestSystemModerationReport,
  insertTestUserWarning,
  setPostOpenAIModerationFlaggedOnly,
  setPostSpamDetectionComplete,
  setTestBanEvasionFlag,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import crypto from 'node:crypto'
import { dismissBanEvasionFlag } from '@services/communities/ban-evasion'
import {
  dismissModerationAppeal,
  resolveModerationAppealAccept,
} from '@services/moderation-appeals'
import { deliverModerationAppealForTest } from '@services/moderation-appeals/resolution.test-helpers'
import { checkPostClearance } from '@services/post-clearance'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import { getModerationAnalytics } from './get-moderation-analytics.mts'

describe('getModerationAnalytics review regressions', () => {
  it('preserves resolved ban-evasion reports in community queue volume', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const suspect = await createTestUser()
    const sourceUser = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Resolved Ban Evasion ${suffix}`,
      slug: `analytics-resolved-ban-evasion-${suffix}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: suspect.id })
    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: suspect.id,
      sourceUserId: sourceUser.id,
    })
    await insertTestSystemModerationReport('user', suspect.id, 'Suspected ban evasion')
    await dismissBanEvasionFlag(owner, community.id, suspect.id)

    const metrics = await getModerationAnalytics('7d', {
      type: 'community',
      communityId: community.id,
    })

    expect(metrics.queue_volume.total_reports).toBe(1)
    expect(metrics.queue_volume.pending_reports).toBe(0)
    expect(metrics.queue_volume.reports_over_time).toEqual([expect.objectContaining({ count: 1 })])
  })

  it('preserves automod rejection history after post flags are cleared', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const author = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Clearance History ${suffix}`,
      slug: `analytics-clearance-history-${suffix}`,
    })
    const postId = await insertTestPost({
      title: `Clearance History Post ${suffix}`,
      slug: `clearance-history-post-${suffix}`,
      createdById: author.id,
      markdown: 'flagged post',
      communityId: community.id,
    })
    await recordTestPostModerationDisposition({
      postId,
      source: 'openai_omni',
      disposition: 'reject',
      reasonCode: 'sexual_minors',
    })
    await setPostSpamDetectionComplete(postId, true)
    await checkPostClearance(postId)
    const beforeFlagsAreCleared = await getModerationAnalytics('7d', {
      type: 'community',
      communityId: community.id,
    })
    await approveTestPost(postId)
    await setPostOpenAIModerationFlaggedOnly(postId, false)
    await setPostSpamDetectionComplete(postId, false)

    const metrics = await getModerationAnalytics('7d', {
      type: 'community',
      communityId: community.id,
    })

    expect(metrics.automod_performance.total_actions).toBe(2)
    expect(beforeFlagsAreCleared.automod_performance.sources).toEqual([
      { source_type: 'openai_omni', count: 1 },
      { source_type: 'spam_detection', count: 1 },
    ])
    expect(metrics.automod_performance.sources).toEqual([
      { source_type: 'openai_omni', count: 1 },
      { source_type: 'spam_detection', count: 1 },
    ])
    expect(metrics.automod_performance.actions_over_time).toEqual([
      expect.objectContaining({ type: 'openai_omni', count: 1 }),
      expect.objectContaining({ type: 'spam_detection', count: 1 }),
    ])
  })

  it('counts automod reject actions as auto-removes', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const automod = await createSystemUser(MODERATION_SYSTEM_USERNAME)
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Automod Reject ${suffix}`,
      slug: `analytics-automod-reject-${suffix}`,
    })

    await insertTestModeratorAction({
      actorId: automod.id,
      actionType: 'reject',
      communityId: community.id,
    })

    const metrics = await getModerationAnalytics('all', {
      type: 'community',
      communityId: community.id,
    })

    expect(metrics.automod_performance.auto_removes).toBe(1)
  })

  it('counts unpublished first community posts as first-post rejections', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const author = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Unpublished Friction ${suffix}`,
      slug: `analytics-unpublished-friction-${suffix}`,
    })
    const firstPostId = await insertTestPost({
      title: `Unpublished First Post ${suffix}`,
      slug: `unpublished-first-post-${suffix}`,
      createdById: author.id,
      markdown: 'first post',
      communityId: community.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId: firstPostId })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId: firstPostId,
      unpublishedAt: new Date(),
    })

    const metrics = await getModerationAnalytics('all', {
      type: 'community',
      communityId: community.id,
    })

    expect(metrics.new_user_friction).toEqual({
      first_posts: 1,
      rejected_first_posts: 1,
      rejection_rate: 1,
    })
  })

  it('counts denied moderation appeals in the denied bucket', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const appellant = await createTestUser()
    const staff = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Appeals ${suffix}`,
      slug: `analytics-appeals-${suffix}`,
    })
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
      communityId: community.id,
    })
    const appeal = await insertTestModerationAppeal({
      appellantId: appellant.id,
      userWarningId: warning.id,
      communityId: community.id,
    })
    await deliverModerationAppealForTest(staff.id, appeal.id)
    await dismissModerationAppeal(staff.id, appeal.id)

    const metrics = await getModerationAnalytics('all', {
      type: 'community',
      communityId: community.id,
    })

    expect(metrics.appeals).toEqual({
      total_closed: 1,
      accepted: 0,
      reduced: 0,
      denied: 1,
      dismissed: 0,
      success_rate: 0,
    })
  })

  it('does not count accepted moderation appeals as dismissed', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const appellant = await createTestUser()
    const staff = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Accepted Appeals ${suffix}`,
      slug: `analytics-accepted-appeals-${suffix}`,
    })
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
      communityId: community.id,
    })
    const appeal = await insertTestModerationAppeal({
      appellantId: appellant.id,
      userWarningId: warning.id,
      communityId: community.id,
    })
    await deliverModerationAppealForTest(staff.id, appeal.id)
    await resolveModerationAppealAccept(staff.id, appeal.id)

    const metrics = await getModerationAnalytics('all', {
      type: 'community',
      communityId: community.id,
    })

    expect(metrics.appeals).toEqual({
      total_closed: 1,
      accepted: 1,
      reduced: 0,
      denied: 0,
      dismissed: 0,
      success_rate: 1,
    })
  })
})
