import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { addUserRole } from '@services/users/roles-permissions'
import { background } from '@queues/background/queues'
import { NOTIFICATIONS_CRITICAL_MODERATION_ALERT_JOB } from '@queues/background/enqueues/critical-moderation-alert-job'
import { enqueueContinueCriticalModerationAlertNotification } from '@queues/notifications/enqueues'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { createCriticalModerationAlertNotificationPage } from '@services/notifications/create-critical-moderation-alert-notification'
import { deleteNotification } from '@services/notifications/mutations'
import { listNotifications } from '@services/notifications/list'
import {
  createTestUser,
  createTestUserWithId,
  insertTestModerationReport,
  insertTestPost,
  safeUsername,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import { uuidAfter, uuidBefore } from '@voucha/test-helpers/uuid-before'
import { handleCriticalModerationAlertNotification } from './critical-moderation-alert.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('critical moderation alert worker paging', () => {
  it('continues pages through real GlideMQ and replays each page idempotently', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(pagedDispatchConfig, { notifications_page_size: 1 }),
    )
    const reporter = await createTestUser()
    const firstRecipientId = (await createTestUser({ extraRoles: ['moderator'] })).id
    const secondRecipientId = uuidAfter(firstRecipientId)
    const thirdRecipientId = uuidAfter(secondRecipientId)
    const recipientIds = [firstRecipientId, secondRecipientId, thirdRecipientId]
    await Promise.all(
      [secondRecipientId, thirdRecipientId].map(id =>
        createTestUserWithId(id, safeUsername('critical-alert-worker')),
      ),
    )
    await Promise.all([secondRecipientId, thirdRecipientId].map(id => addUserRole(id, 'moderator')))
    const postId = await insertTestPost({
      createdById: reporter.id,
      title: `critical alert ${randomUUID()}`,
      slug: `critical-alert-${randomUUID()}`,
      markdown: 'Critical alert worker page boundary',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'illegal_content',
    })
    const ownedQueueJobs: Array<Job> = []
    const ownedNotifications: Array<{ userId: string; notificationId: string }> = []
    onTestFinished(async () => {
      await Promise.all(ownedQueueJobs.map(job => job.remove()))
      await Promise.all(
        ownedNotifications.map(({ userId, notificationId }) =>
          deleteNotification(userId, notificationId),
        ),
      )
    })

    const firstPage = await createCriticalModerationAlertNotificationPage(
      reportId,
      uuidBefore(firstRecipientId),
      1,
    )
    expect(firstPage.nextAfterUserId).toBe(recipientIds[0])
    await enqueueContinueCriticalModerationAlertNotification({
      reportId,
      afterUserId: firstPage.nextAfterUserId!,
    })
    const firstNotification = Object.values(
      (await listNotifications(recipientIds[0]!)).notifications,
    ).find(notification => notification.moderation_report_id === reportId)
    if (!firstNotification) throw new Error('Expected the first critical alert page notification')
    ownedNotifications.push({ userId: recipientIds[0]!, notificationId: firstNotification.id })
    const firstPush = await background.getJob(
      `processDeliverNotificationPushIntent__${recipientIds[0]}__${firstNotification.id}`,
    )
    if (firstPush) ownedQueueJobs.push(firstPush)

    const firstContinuation = await background.getJob(
      `notifications__critical-moderation-alert__${reportId}__${recipientIds[0]}`,
    )
    if (!firstContinuation) throw new Error('Expected the first critical alert continuation')
    ownedQueueJobs.push(firstContinuation)

    const handle = handleCriticalModerationAlertNotification
    const harness = await startRealGlideBackgroundLifecycle({
      queueNamePrefix: 'critical_alert_dispatch_page',
      connection: { connection: workerQueueConnection, prefix: workerQueuePrefix },
      workerOptions: { blockTimeout: 100 },
      processor: job => handle(job as Job<{ reportId: string; afterUserId: string }>),
    })
    const execute = async (admitted: Job) => {
      const active = await harness.add(NOTIFICATIONS_CRITICAL_MODERATION_ALERT_JOB, admitted.data, {
        ...admitted.opts,
        jobId: admitted.id,
        removeOnComplete: false,
        removeOnFail: false,
      })
      expect(await harness.settled(active)).toBe('completed')
      const retained = await harness.queue.getJob(active.id)
      if (!retained) throw new Error('Expected the critical alert page receipt to remain')
      return retained
    }

    let current = await execute(firstContinuation)
    for (const recipient of recipientIds.slice(1)) {
      const receipt = (
        current as Job<{
          dispatchReceipt?: { result: { nextAfterUserId: string | null } }
        }>
      ).data.dispatchReceipt
      const expectedCursors = recipient === recipientIds.at(-1) ? [null, recipient] : [recipient]
      expect(expectedCursors).toContain(receipt?.result.nextAfterUserId)
      await expect(
        handle(current as Job<{ reportId: string; afterUserId: string }>),
      ).resolves.toEqual(receipt?.result)
      const notification = Object.values((await listNotifications(recipient)).notifications).find(
        candidate => candidate.moderation_report_id === reportId,
      )
      if (!notification) throw new Error(`Expected a critical alert notification for ${recipient}`)
      ownedNotifications.push({ userId: recipient, notificationId: notification.id })
      const push = await background.getJob(
        `processDeliverNotificationPushIntent__${recipient}__${notification.id}`,
      )
      if (push) ownedQueueJobs.push(push)

      if (receipt?.result.nextAfterUserId) {
        const next = await background.getJob(
          `notifications__critical-moderation-alert__${reportId}__${receipt.result.nextAfterUserId}`,
        )
        if (!next) throw new Error('Expected the next critical alert continuation')
        ownedQueueJobs.push(next)
        if (recipient !== recipientIds.at(-1)) current = await execute(next)
      }
    }

    expect(
      await Promise.all(
        recipientIds.map(
          async userId =>
            Object.values((await listNotifications(userId)).notifications).filter(
              notification => notification.moderation_report_id === reportId,
            ).length,
        ),
      ),
    ).toEqual([1, 1, 1])
    expect(ownedNotifications).toHaveLength(3)
  })
})
