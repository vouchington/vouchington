import { describe, expect, it } from 'vitest'
import {
  createSystemUser,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModeratorAction,
  insertTestModerationReport,
  insertTestPost,
  insertTestSystemModerationReport,
  markTestPostDeletedBy,
  setTestBanEvasionFlag,
} from '@voucha/test-helpers'
import crypto from 'node:crypto'
import { getModerationAnalytics } from './get-moderation-analytics.mts'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'

describe('getModerationAnalytics', () => {
  it('excludes automated system users from moderator workload rankings', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const humanModerator = await createTestUser()
    const automod = await createSystemUser(MODERATION_SYSTEM_USERNAME)
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Workload ${suffix}`,
      slug: `analytics-workload-${suffix}`,
    })

    await Promise.all([
      insertTestModeratorAction({
        actorId: automod.id,
        actionType: 'remove',
        communityId: community.id,
      }),
      insertTestModeratorAction({
        actorId: humanModerator.id,
        actionType: 'approve',
        communityId: community.id,
      }),
    ])

    const metrics = await getModerationAnalytics('all', {
      type: 'community',
      communityId: community.id,
    })

    expect(metrics.moderator_workload.moderators).toEqual([
      expect.objectContaining({ actor_id: humanModerator.id, total: 1 }),
    ])
  })

  it('counts moderator-deleted first posts as first-post rejections', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const moderator = await createTestUser()
    const author = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Friction ${suffix}`,
      slug: `analytics-friction-${suffix}`,
    })
    const firstPostId = await insertTestPost({
      title: `First Post ${suffix}`,
      slug: `first-post-${suffix}`,
      createdById: author.id,
      markdown: 'first post',
      communityId: community.id,
    })
    await markTestPostDeletedBy(firstPostId, moderator.id)
    await insertTestPost({
      title: `Second Post ${suffix}`,
      slug: `second-post-${suffix}`,
      createdById: author.id,
      markdown: 'second post',
      communityId: community.id,
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

  it('counts pending backlog outside the selected range', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const reporter = await createTestUser()
    const author = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Backlog ${suffix}`,
      slug: `analytics-backlog-${suffix}`,
    })
    const postId = await insertTestPost({
      title: `Backlog Post ${suffix}`,
      slug: `backlog-post-${suffix}`,
      createdById: author.id,
      markdown: 'old report',
      communityId: community.id,
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    })

    const metrics = await getModerationAnalytics('7d', {
      type: 'community',
      communityId: community.id,
    })

    expect(metrics.queue_volume.total_reports).toBe(0)
    expect(metrics.queue_volume.pending_reports).toBe(1)
    expect(metrics.queue_volume.reports_over_time).toEqual([])
  })

  it('includes active ban-evasion reports in community queue volume', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const suspect = await createTestUser()
    const sourceUser = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Ban Evasion ${suffix}`,
      slug: `analytics-ban-evasion-${suffix}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: suspect.id })
    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: suspect.id,
      sourceUserId: sourceUser.id,
    })
    await insertTestSystemModerationReport('user', suspect.id, 'Suspected ban evasion')

    const metrics = await getModerationAnalytics('7d', {
      type: 'community',
      communityId: community.id,
    })

    expect(metrics.queue_volume.total_reports).toBe(1)
    expect(metrics.queue_volume.pending_reports).toBe(1)
    expect(metrics.queue_volume.reports_over_time).toEqual([expect.objectContaining({ count: 1 })])
  })

  it('includes active ban-evasion reports in community rule violations', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const suspect = await createTestUser()
    const sourceUser = await createTestUser()
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics Ban Reasons ${suffix}`,
      slug: `analytics-ban-reasons-${suffix}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: suspect.id })
    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: suspect.id,
      sourceUserId: sourceUser.id,
    })
    await insertTestSystemModerationReport('user', suspect.id, 'Suspected ban evasion')

    const metrics = await getModerationAnalytics('7d', {
      type: 'community',
      communityId: community.id,
    })

    expect(metrics.rule_violations.reasons).toEqual([{ reason: 'other', count: 1 }])
    expect(metrics.rule_violations.reasons_over_time).toEqual([
      expect.objectContaining({ type: 'other', count: 1 }),
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
})
