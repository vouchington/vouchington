import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getLatestTestModerationTrainingFeedback,
  getModeratorActionRowsForTest,
  insertTestCommunity,
  insertTestModerationReport,
  insertTestPost,
  withFailingTransactionQueryOptionsForTest,
} from '@voucha/test-helpers'
import { searchModeratorActions } from '@services/moderator-actions'
import { listNotifications } from '@services/notifications'
import { findOpenCaseForEntity } from '@services/moderation-cases'
import { getModerationReportById } from '../get-by-id.mts'
import { resolveModerationReport } from '../resolve.mts'
import { enqueueReportResolutionNotificationsBestEffort } from '../enqueue-report-resolution-notifications.mts'

describe('resolveModerationReport', () => {
  it('updates a pending report and records a scoped moderator action', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const reporter = await createTestUser()
    const targetAuthor = await createTestUser()
    const community = await insertTestCommunity({ createdById: moderator.id })
    const postId = await insertTestPost({
      createdById: targetAuthor.id,
      communityId: community.id,
      slug: `resolve-report-${crypto.randomUUID().slice(0, 8)}`,
      title: `Resolve report ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Reported content',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })

    const report = await resolveModerationReport(reportId, {
      resolvedById: moderator.id,
      status: 'dismissed',
    })

    expect(report.id).toBe(reportId)
    expect(report.status).toBe('dismissed')
    expect(report.resolved_by_id).toBe(moderator.id)
    expect(report.entity_type).toBe('post')
    expect(report.entity_id).toBe(postId)

    const { results } = await searchModeratorActions({
      communityId: community.id,
      actorId: moderator.id,
      actionType: 'dismiss_report',
      limit: 20,
    })
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          report_id: reportId,
          community_id: community.id,
          actor_id: moderator.id,
          action_type: 'dismiss_report',
        }),
      ]),
    )
  })

  it('rejects community-scoped resolution outside the report community', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const reporter = await createTestUser()
    const targetAuthor = await createTestUser()
    const [reportCommunity, otherCommunity] = await Promise.all([
      insertTestCommunity({ createdById: moderator.id }),
      insertTestCommunity({ createdById: moderator.id }),
    ])
    const postId = await insertTestPost({
      createdById: targetAuthor.id,
      communityId: reportCommunity.id,
      slug: `resolve-forbidden-${crypto.randomUUID().slice(0, 8)}`,
      title: `Resolve forbidden ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Reported content',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'harassment',
    })

    await expect(
      resolveModerationReport(reportId, {
        communityId: otherCommunity.id,
        resolvedById: moderator.id,
        status: 'reviewed',
      }),
    ).rejects.toThrow('Forbidden')
  })

  it('keeps push enqueue failures best-effort', () => {
    expect(() =>
      enqueueReportResolutionNotificationsBestEffort(
        [{ user_id: crypto.randomUUID(), id: crypto.randomUUID() }],
        () => {
          throw new Error('queue unavailable')
        },
      ),
    ).not.toThrow()
  })

  it('rejects reports that were already resolved', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const reporter = await createTestUser()
    const targetAuthor = await createTestUser()
    const postId = await insertTestPost({
      createdById: targetAuthor.id,
      slug: `resolve-already-${crypto.randomUUID().slice(0, 8)}`,
      title: `Resolve already ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Reported content',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'other',
    })
    await resolveModerationReport(reportId, {
      resolvedById: moderator.id,
      status: 'reviewed',
    })

    await expect(
      resolveModerationReport(reportId, {
        resolvedById: moderator.id,
        status: 'dismissed',
      }),
    ).rejects.toThrow('Report is already resolved')
  })

  it('rolls back report resolution side effects when one side effect fails', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const reporter = await createTestUser()
    const targetAuthor = await createTestUser()
    const community = await insertTestCommunity({ createdById: moderator.id })
    const postId = await insertTestPost({
      createdById: targetAuthor.id,
      communityId: community.id,
      slug: `resolve-rollback-${crypto.randomUUID().slice(0, 8)}`,
      title: `Resolve rollback ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Reported content',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })

    await expect(
      withFailingTransactionQueryOptionsForTest('recordModeratorAction', queryOptions =>
        resolveModerationReport(
          reportId,
          {
            resolvedById: moderator.id,
            status: 'dismissed',
          },
          queryOptions,
        ),
      ),
    ).rejects.toThrow('Injected query failure for recordModeratorAction')

    const report = await getModerationReportById(reportId)
    expect(report).toEqual(
      expect.objectContaining({
        status: 'pending',
        reviewed_at: null,
        resolved_by_id: null,
      }),
    )

    const openCase = await findOpenCaseForEntity({ entityType: 'post', entityId: postId })
    expect(openCase).not.toBeNull()

    const feedback = await getLatestTestModerationTrainingFeedback({
      postId,
      sourceType: 'moderation_report',
      humanAction: 'report_dismissed',
    })
    expect(feedback).toBeUndefined()

    const notifications = await listNotifications(reporter.id)
    expect(Object.values(notifications.notifications)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ moderation_report_id: reportId })]),
    )

    const actions = await getModeratorActionRowsForTest({
      actorId: moderator.id,
      communityId: community.id,
    })
    expect(actions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ report_id: reportId })]),
    )
  })
})
