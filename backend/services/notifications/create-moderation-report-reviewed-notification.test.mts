import {
  createTestUserDirect,
  insertTestModerationReport,
  insertTestPost,
  markModerationReportReviewedForTest,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { createModerationReportReviewedNotification } from './create-moderation-report-reviewed-notification.mts'
import { listNotifications } from './list.mts'

describe('createModerationReportReviewedNotification', () => {
  it('creates one generic notification for the reporter', async () => {
    const { reporter, reportId } = await createReviewedReport()

    const result = await createModerationReportReviewedNotification(reportId)

    expect(result).toHaveLength(1)
    expect(result[0]!.user_id).toBe(reporter.id)

    const notifications = await listNotifications(reporter.id)
    const notification = notifications.notifications[result[0]!.id]
    expect(notification).toEqual(
      expect.objectContaining({
        entity_type: 'moderation_report',
        moderation_report_id: reportId,
        post_id: null,
        rss_feed_item_id: null,
        actor_user_id: null,
        actor_label: null,
        title: 'Your report was reviewed',
        body: 'Thanks for helping keep Voucha safe.',
        target_path: null,
        target_entity: null,
        target_intent: 'notifications_inbox',
      }),
    )
    expect(notification?.title).not.toContain('Notification report target')
    expect(notification?.body).not.toMatch(/appeal|moderator|reporter/i)
  })

  it('deduplicates repeated calls for the same report', async () => {
    const { reportId } = await createReviewedReport()

    const first = await createModerationReportReviewedNotification(reportId)
    const second = await createModerationReportReviewedNotification(reportId)

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(0)
  })

  async function createReviewedReport() {
    const owner = await createTestUserDirect()
    const reporter = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: owner.id,
      slug: `notification-report-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Notification report target',
      markdown: 'Body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    await markModerationReportReviewedForTest({ reportId, resolvedById: owner.id })
    return { reporter, reportId }
  }
})
