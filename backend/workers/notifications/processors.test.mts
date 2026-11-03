import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush from 'web-push'

import {
  processReconcilePostNotifications,
  processReconcileRssFeedItemNotifications,
  processDeliverNotificationPushIntent,
  processReconcileNotificationPushIntents,
  processFollowNotification,
} from './processors.mts'
import type { reconcileNotificationsForPost } from '@services/notifications/reconcile-post'
import type { reconcileNotificationsForRssFeedItem } from '@services/notifications/reconcile-rss-feed-item'
import type {
  enqueueContinueNotificationPushIntentReconciliation,
  enqueueDeliverNotificationPushIntent,
} from '@queues/notifications/enqueues'
import { listAvailableNotificationPushIntents } from '@services/notifications-push'
import { createTestUser, createTestUserDirect, insertTestBlock } from '@voucha/test-helpers'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { listNotifications } from '@services/notifications/list'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { background } from '@queues/background/queues'
import { NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB } from '@queues/background/enqueues/notifications-jobs'

const mockReconcileNotificationsForPost = vi.fn<typeof reconcileNotificationsForPost>()
const mockReconcileNotificationsForRssFeedItem =
  vi.fn<typeof reconcileNotificationsForRssFeedItem>()

async function queuedPushes(userIds: string[]) {
  const jobs = await readAllQueueJobs(background)
  return jobs
    .filter(job => job.name === NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB.name)
    .map(job => job.data as { userId: string; notificationId: string })
    .filter(data => userIds.includes(data.userId))
}

describe('processFollowNotification', () => {
  it('does not notify a user blocked by the follower', async () => {
    const followee = await createTestUser()
    const follower = await createTestUser()
    await insertTestBlock(follower.id, followee.id)

    await processFollowNotification({ followeeId: followee.id, followerId: follower.id })

    expect((await listNotifications(followee.id)).results).toHaveLength(0)
  })
})

describe('notification reconcile processors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enqueues post push delivery per created notification batch', async () => {
    const [first, second, third] = [1, 2, 3].map(() => ({
      user_id: crypto.randomUUID(),
      id: crypto.randomUUID(),
    }))
    mockReconcileNotificationsForPost.mockImplementation(async (_postId, options) => {
      await options!.onCreatedNotifications!([first!, second!])
      await options!.onCreatedNotifications!([third!])
      return { created: 3, pruned: 1 }
    })

    await expect(runReconcilePostNotifications({ postId: 'post-1' })).resolves.toEqual({
      created: 3,
      pruned: 1,
    })

    const pushes = await queuedPushes([first!.user_id, second!.user_id, third!.user_id])
    expect(pushes).toHaveLength(3)
    expect(pushes).toEqual(
      expect.arrayContaining([
        { userId: first!.user_id, notificationId: first!.id },
        { userId: second!.user_id, notificationId: second!.id },
        { userId: third!.user_id, notificationId: third!.id },
      ]),
    )
  })

  it('enqueues RSS push delivery per created notification batch', async () => {
    const [first, second] = [1, 2].map(() => ({
      user_id: crypto.randomUUID(),
      id: crypto.randomUUID(),
    }))
    mockReconcileNotificationsForRssFeedItem.mockImplementation(async (_rssFeedItemId, options) => {
      await options!.onCreatedNotifications!([first!])
      await options!.onCreatedNotifications!([second!])
      return { created: 2, pruned: 0 }
    })

    await expect(
      runReconcileRssFeedItemNotifications({ rssFeedItemId: 'item-1' }),
    ).resolves.toEqual({
      created: 2,
      pruned: 0,
    })

    const pushes = await queuedPushes([first!.user_id, second!.user_id])
    expect(pushes).toHaveLength(2)
    expect(pushes).toEqual(
      expect.arrayContaining([
        { userId: first!.user_id, notificationId: first!.id },
        { userId: second!.user_id, notificationId: second!.id },
      ]),
    )
  })
})

describe('notification push intent processors', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('makes a no-op when a delivery intent is absent', async () => {
    await expect(
      processDeliverNotificationPushIntent({
        userId: crypto.randomUUID(),
        notificationId: crypto.randomUUID(),
      }),
    ).resolves.toEqual({ delivered: 0, suppressed: false })
  })

  it('hands a claimed intent to the delivery service', async () => {
    // generateVAPIDKeys zero-pads the private key; raw ECDH keys are sometimes shorter than 32 bytes.
    const vapidKeys = webpush.generateVAPIDKeys()
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', vapidKeys.publicKey)
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', vapidKeys.privateKey)
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:tests+push-processor@voucha.ai')
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    await expect(
      processDeliverNotificationPushIntent({
        userId: recipient.id,
        notificationId: notification!.id,
      }),
    ).resolves.toEqual({ delivered: 0, suppressed: false })
  })

  it('reports a nonempty durable-intent reconciliation batch', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const result = await processReconcileNotificationPushIntents(
      {},
      {
        listAvailableNotificationPushIntents: (limit, page) =>
          listAvailableNotificationPushIntents(limit, {
            ...page,
            notificationIds: [notification!.id],
          }),
      },
    )
    expect(result.enqueued).toBe(1)
  })
})

describe('notification push-intent recovery', () => {
  it('chains another bounded page when at least 100 intents are available', async () => {
    const updatedAt = '2026-09-05 23:59:00.000001+00'
    const scanBefore = '2026-09-06 00:00:00.000002+00'
    const intents = Array.from({ length: 100 }, (_, index) => ({
      user_id: `user-${index}`,
      notification_id: `notification-${index}`,
      updated_at: updatedAt,
      scan_before: scanBefore,
    }))
    const listIntents = vi
      .fn<typeof listAvailableNotificationPushIntents>()
      .mockResolvedValue(intents)
    const enqueueIntent = vi
      .fn<typeof enqueueDeliverNotificationPushIntent>()
      .mockResolvedValue(undefined)
    const enqueueContinuation = vi
      .fn<typeof enqueueContinueNotificationPushIntentReconciliation>()
      .mockResolvedValue(undefined)

    await expect(
      processReconcileNotificationPushIntents(
        {},
        {
          listAvailableNotificationPushIntents: listIntents,
          enqueueDeliverNotificationPushIntent: enqueueIntent,
          enqueueContinueNotificationPushIntentReconciliation: enqueueContinuation,
        },
      ),
    ).resolves.toEqual({ enqueued: 100 })

    expect(listIntents).toHaveBeenCalledWith(100, {})
    expect(enqueueIntent).toHaveBeenCalledTimes(100)
    expect(enqueueContinuation).toHaveBeenCalledWith({
      scanBefore,
      after: {
        updatedAt,
        userId: 'user-99',
        notificationId: 'notification-99',
      },
    })
  })
})
function runReconcilePostNotifications(data: { postId: string; afterUserId?: string }) {
  return processReconcilePostNotifications(data, {
    reconcileNotificationsForPost: mockReconcileNotificationsForPost,
  })
}

function runReconcileRssFeedItemNotifications(data: {
  rssFeedItemId: string
  afterUserId?: string
}) {
  return processReconcileRssFeedItemNotifications(data, {
    reconcileNotificationsForRssFeedItem: mockReconcileNotificationsForRssFeedItem,
  })
}
