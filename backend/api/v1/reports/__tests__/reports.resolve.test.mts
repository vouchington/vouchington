import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getLatestTestModerationTrainingFeedback,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import { listNotifications } from '@services/notifications'
import type { PrivateUser } from '@services/users/types'

describe('PATCH /api/v1/reports/:id', () => {
  let owner: PrivateUser
  let reporter: PrivateUser
  let admin: PrivateUser
  let siteModerator: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser()
    reporter = await createTestUser()
    admin = await createTestUser({ administrator: true })
    siteModerator = await createTestUser({ extraRoles: ['moderator'] })
  })

  it('allows admins to mark a pending report reviewed and notify the reporter', async () => {
    const reportId = await createPostReport()
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .patch(`/api/v1/reports/${reportId}`)
      .send({ status: 'reviewed' })
      .expect(200)

    expect(response.body.report).toEqual(
      expect.objectContaining({
        id: reportId,
        status: 'reviewed',
        resolved_by_id: admin.id,
      }),
    )

    const notifications = await listNotifications(reporter.id)
    expect(Object.values(notifications.notifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_type: 'moderation_report',
          moderation_report_id: reportId,
          title: 'Your report was reviewed',
          target_path: null,
          target_intent: 'notifications_inbox',
        }),
      ]),
    )
  })

  it('allows admins to dismiss a pending report and notify the reporter', async () => {
    const reportId = await createPostReport()
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.patch(`/api/v1/reports/${reportId}`).send({ status: 'dismissed' }).expect(200)

    const notifications = await listNotifications(reporter.id)
    expect(Object.values(notifications.notifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_type: 'moderation_report',
          moderation_report_id: reportId,
        }),
      ]),
    )
  })

  it('allows site moderators to mark a pending report reviewed and notify the reporter', async () => {
    const reportId = await createPostReport()
    const request = createRequest()
    await request.authenticateAs(siteModerator)

    const response = await request
      .patch(`/api/v1/reports/${reportId}`)
      .send({ status: 'reviewed' })
      .expect(200)

    expect(response.body.report).toEqual(
      expect.objectContaining({
        id: reportId,
        status: 'reviewed',
        resolved_by_id: siteModerator.id,
      }),
    )

    const notifications = await listNotifications(reporter.id)
    expect(Object.values(notifications.notifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_type: 'moderation_report',
          moderation_report_id: reportId,
          title: 'Your report was reviewed',
          target_path: null,
          target_intent: 'notifications_inbox',
        }),
      ]),
    )
  })

  it('allows site moderators to dismiss a pending report and notify the reporter', async () => {
    const reportId = await createPostReport()
    const request = createRequest()
    await request.authenticateAs(siteModerator)

    await request.patch(`/api/v1/reports/${reportId}`).send({ status: 'dismissed' }).expect(200)

    const notifications = await listNotifications(reporter.id)
    expect(Object.values(notifications.notifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_type: 'moderation_report',
          moderation_report_id: reportId,
          title: 'Your report was reviewed',
          target_path: null,
          target_intent: 'notifications_inbox',
        }),
      ]),
    )
  })

  it('records comment report feedback against the comment post id', async () => {
    const rootPostId = await insertTestPost({
      createdById: owner.id,
      slug: `resolve-comment-root-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Resolve comment root',
      markdown: 'Root body',
    })
    const commentId = await insertTestPost({
      createdById: owner.id,
      slug: `resolve-comment-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Resolve comment',
      markdown: 'Comment body',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'comment',
      entityId: commentId,
      reason: 'spam',
    })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.patch(`/api/v1/reports/${reportId}`).send({ status: 'reviewed' }).expect(200)

    await expect(
      getLatestTestModerationTrainingFeedback({
        postId: commentId,
        sourceType: 'moderation_report',
        humanAction: 'report_reviewed',
      }),
    ).resolves.toMatchObject({ label: 'accepted' })
  })

  it('returns 409 when resolving a report that is no longer pending', async () => {
    const reportId = await createPostReport()
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.patch(`/api/v1/reports/${reportId}`).send({ status: 'reviewed' }).expect(200)
    await request.patch(`/api/v1/reports/${reportId}`).send({ status: 'dismissed' }).expect(409)
  })

  it('returns 403 for ordinary users', async () => {
    const reportId = await createPostReport()
    const request = createRequest()
    await request.authenticateAs(reporter)

    await request.patch(`/api/v1/reports/${reportId}`).send({ status: 'reviewed' }).expect(403)
  })

  it('returns 422 for invalid resolution status', async () => {
    const reportId = await createPostReport()
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.patch(`/api/v1/reports/${reportId}`).send({ status: 'actioned' }).expect(422)
  })

  async function createPostReport() {
    const postId = await insertTestPost({
      createdById: owner.id,
      slug: `resolve-report-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Resolve report target',
      markdown: 'Body',
    })
    return insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
  }
})
