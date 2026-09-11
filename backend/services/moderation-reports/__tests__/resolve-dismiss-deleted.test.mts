import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getModeratorActionRowsForTest,
  insertTestCommunity,
  insertTestModerationReport,
  insertTestPost,
  withFailingTransactionQueryOptionsForTest,
} from '@voucha/test-helpers'
import { findOpenCaseForEntity, getCaseById } from '@services/moderation-cases'
import { listNotifications } from '@services/notifications'
import { getModerationSystemUserId } from '@services/users/system-users'
import { getModerationReportById } from '../get-by-id.mts'
import { dismissPendingReportsForDeletedEntity } from '../resolve.mts'

describe('dismissPendingReportsForDeletedEntity', () => {
  it('dismisses all pending reports for the entity and closes the case', async () => {
    const reporter1 = await createTestUser()
    const reporter2 = await createTestUser()
    const target = await createTestUser()

    const reportId1 = await insertTestModerationReport({
      reporterUserId: reporter1.id,
      entityType: 'user',
      entityId: target.id,
    })
    const reportId2 = await insertTestModerationReport({
      reporterUserId: reporter2.id,
      entityType: 'user',
      entityId: target.id,
    })

    const count = await dismissPendingReportsForDeletedEntity('user', target.id)
    expect(count).toBe(2)

    const openCase = await findOpenCaseForEntity({ entityType: 'user', entityId: target.id })
    expect(openCase).toBeNull()

    const automodUserId = await getModerationSystemUserId()
    const actions = (await getModeratorActionRowsForTest({ actorId: automodUserId })).filter(
      action => action.report_id === reportId1 || action.report_id === reportId2,
    )
    expect(actions).toHaveLength(2)
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_type: 'dismiss_report',
          community_id: null,
          report_id: reportId1,
        }),
        expect.objectContaining({
          action_type: 'dismiss_report',
          community_id: null,
          report_id: reportId2,
        }),
      ]),
    )
  })

  it('attributes automatic post deletion dismissals to automod in reports and modlog', async () => {
    const reporter1 = await createTestUser()
    const reporter2 = await createTestUser()
    const targetAuthor = await createTestUser()
    const communityOwner = await createTestUser()
    const community = await insertTestCommunity({ createdById: communityOwner.id })
    const postId = await insertTestPost({
      createdById: targetAuthor.id,
      communityId: community.id,
      slug: `dismiss-deleted-report-${crypto.randomUUID().slice(0, 8)}`,
      title: `Dismiss deleted report ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Reported content',
    })

    const reportId1 = await insertTestModerationReport({
      reporterUserId: reporter1.id,
      entityType: 'post',
      entityId: postId,
    })
    const reportId2 = await insertTestModerationReport({
      reporterUserId: reporter2.id,
      entityType: 'post',
      entityId: postId,
    })
    const openCase = await findOpenCaseForEntity({ entityType: 'post', entityId: postId })
    expect(openCase).not.toBeNull()

    const count = await dismissPendingReportsForDeletedEntity('post', postId)
    expect(count).toBe(2)

    const automodUserId = await getModerationSystemUserId()
    await expect(getModerationReportById(reportId1)).resolves.toEqual(
      expect.objectContaining({ status: 'dismissed', resolved_by_id: automodUserId }),
    )
    await expect(getModerationReportById(reportId2)).resolves.toEqual(
      expect.objectContaining({ status: 'dismissed', resolved_by_id: automodUserId }),
    )
    await expect(getCaseById(openCase!.id)).resolves.toEqual(
      expect.objectContaining({ resolved_by_id: automodUserId }),
    )

    const actions = await getModeratorActionRowsForTest({
      actorId: automodUserId,
      communityId: community.id,
    })
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_type: 'dismiss_report',
          actor_id: automodUserId,
          community_id: community.id,
          report_id: reportId1,
        }),
        expect.objectContaining({
          action_type: 'dismiss_report',
          actor_id: automodUserId,
          community_id: community.id,
          report_id: reportId2,
        }),
      ]),
    )
  })

  it('records automatic comment report dismissals with community scope', async () => {
    const reporter = await createTestUser()
    const targetAuthor = await createTestUser()
    const communityOwner = await createTestUser()
    const community = await insertTestCommunity({ createdById: communityOwner.id })
    const rootPostId = await insertTestPost({
      createdById: targetAuthor.id,
      communityId: community.id,
      slug: `dismiss-deleted-comment-root-${crypto.randomUUID().slice(0, 8)}`,
      title: `Dismiss deleted comment root ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Root content',
    })
    const commentId = await insertTestPost({
      createdById: targetAuthor.id,
      communityId: community.id,
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
      slug: `dismiss-deleted-comment-${crypto.randomUUID().slice(0, 8)}`,
      title: '',
      markdown: 'Reported comment',
    })

    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'comment',
      entityId: commentId,
    })

    const count = await dismissPendingReportsForDeletedEntity('comment', commentId)
    expect(count).toBe(1)

    const automodUserId = await getModerationSystemUserId()
    await expect(getModerationReportById(reportId)).resolves.toEqual(
      expect.objectContaining({ status: 'dismissed', resolved_by_id: automodUserId }),
    )

    const actions = await getModeratorActionRowsForTest({
      actorId: automodUserId,
      communityId: community.id,
    })
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_type: 'dismiss_report',
          actor_id: automodUserId,
          community_id: community.id,
          report_id: reportId,
        }),
      ]),
    )
  })

  it('rolls back dismissing pending reports when notification creation fails', async () => {
    const reporter1 = await createTestUser()
    const reporter2 = await createTestUser()
    const target = await createTestUser()

    const reportId1 = await insertTestModerationReport({
      reporterUserId: reporter1.id,
      entityType: 'user',
      entityId: target.id,
    })
    const reportId2 = await insertTestModerationReport({
      reporterUserId: reporter2.id,
      entityType: 'user',
      entityId: target.id,
    })

    await expect(
      withFailingTransactionQueryOptionsForTest(
        'createModerationReportReviewedNotification',
        queryOptions => dismissPendingReportsForDeletedEntity('user', target.id, queryOptions),
      ),
    ).rejects.toThrow('Injected query failure for createModerationReportReviewedNotification')

    await expect(getModerationReportById(reportId1)).resolves.toEqual(
      expect.objectContaining({ status: 'pending', reviewed_at: null, resolved_by_id: null }),
    )
    await expect(getModerationReportById(reportId2)).resolves.toEqual(
      expect.objectContaining({ status: 'pending', reviewed_at: null, resolved_by_id: null }),
    )

    const openCase = await findOpenCaseForEntity({ entityType: 'user', entityId: target.id })
    expect(openCase).not.toBeNull()

    for (const [reporterId, reportId] of [
      [reporter1.id, reportId1],
      [reporter2.id, reportId2],
    ]) {
      const notifications = await listNotifications(reporterId)
      expect(Object.values(notifications.notifications)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ moderation_report_id: reportId })]),
      )
    }
  })
})
