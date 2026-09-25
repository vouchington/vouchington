import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush from 'web-push'

import {
  processReconcilePostNotifications,
  processReconcileRssFeedItemNotifications,
  processConversationMessageNotification,
  processDeliverNotificationPushIntent,
  processReconcileNotificationPushIntents,
} from './processors.mts'
import type { reconcileNotificationsForPost } from '@services/notifications/reconcile-post'
import type { reconcileNotificationsForRssFeedItem } from '@services/notifications/reconcile-rss-feed-item'
import type {
  enqueueBulkDeliverNotificationPushIntents,
  enqueueContinueNotificationPushIntentReconciliation,
  enqueueDeliverNotificationPushIntent,
} from '@queues/notifications/enqueues'
import type { listAvailableNotificationPushIntents } from '@services/notifications-push'
import {
  createTestUser,
  createTestUserDirect,
  createTestDirectConversation,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { openModmailThread } from '@services/modmail/threads'
import { createFollowNotification } from '@services/notifications/create-follow-notification'

const mockReconcileNotificationsForPost = vi.fn<typeof reconcileNotificationsForPost>()
const mockReconcileNotificationsForRssFeedItem =
  vi.fn<typeof reconcileNotificationsForRssFeedItem>()
const mockEnqueueBulkDeliverNotificationPushIntents =
  vi.fn<typeof enqueueBulkDeliverNotificationPushIntents>()
describe('processConversationMessageNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueueBulkDeliverNotificationPushIntents.mockResolvedValue(undefined)
  })

  it('returns early and does not enqueue when conversation does not exist', async () => {
    await runConversationMessageNotification({
      conversationId: '00000000-0000-7000-8000-000000000001',
      messageId: 'msg-1',
      senderId: '00000000-0000-7000-8000-000000000002',
    })

    expect(mockEnqueueBulkDeliverNotificationPushIntents).not.toHaveBeenCalled()
  })

  it('creates DM notification for recipient and enqueues push delivery (real DB)', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const conversation = await createTestDirectConversation({
      user1Id: sender.id,
      user2Id: recipient.id,
    })

    await runConversationMessageNotification({
      conversationId: conversation.id,
      messageId: 'msg-dm-1',
      senderId: sender.id,
    })

    expect(mockEnqueueBulkDeliverNotificationPushIntents).toHaveBeenCalled()
    const allArgs = mockEnqueueBulkDeliverNotificationPushIntents.mock.calls.flat(2) as Array<{
      userId: string
    }>
    const userIds = allArgs.map(a => a.userId)
    expect(userIds).toContain(recipient.id)
    expect(userIds).not.toContain(sender.id)
  })

  it('creates modmail notification for subject user and enqueues push delivery (real DB)', async () => {
    const owner = await createTestUser()
    const subject = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const thread = await openModmailThread(subject.id, community.id, subject.id)

    await runConversationMessageNotification({
      conversationId: thread.id,
      messageId: 'msg-mod-1',
      senderId: owner.id,
    })

    expect(mockEnqueueBulkDeliverNotificationPushIntents).toHaveBeenCalled()
    const allArgs = mockEnqueueBulkDeliverNotificationPushIntents.mock.calls.flat(2) as Array<{
      userId: string
    }>
    const userIds = allArgs.map(a => a.userId)
    expect(userIds).toContain(subject.id)
    expect(userIds).not.toContain(owner.id)
  })
})

describe('notification reconcile processors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enqueues post push delivery per created notification batch', async () => {
    mockReconcileNotificationsForPost.mockImplementation(async (_postId, options) => {
      await options!.onCreatedNotifications!([
        { user_id: 'user-1', id: 'notification-1' },
        { user_id: 'user-2', id: 'notification-2' },
      ])
      await options!.onCreatedNotifications!([{ user_id: 'user-3', id: 'notification-3' }])
      return { created: 3, pruned: 1 }
    })

    await expect(runReconcilePostNotifications({ postId: 'post-1' })).resolves.toEqual({
      created: 3,
      pruned: 1,
    })

    expect(mockEnqueueBulkDeliverNotificationPushIntents).toHaveBeenNthCalledWith(1, [
      { userId: 'user-1', notificationId: 'notification-1' },
      { userId: 'user-2', notificationId: 'notification-2' },
    ])
    expect(mockEnqueueBulkDeliverNotificationPushIntents).toHaveBeenNthCalledWith(2, [
      { userId: 'user-3', notificationId: 'notification-3' },
    ])
  })

  it('enqueues RSS push delivery per created notification batch', async () => {
    mockReconcileNotificationsForRssFeedItem.mockImplementation(async (_rssFeedItemId, options) => {
      await options!.onCreatedNotifications!([{ user_id: 'user-4', id: 'notification-4' }])
      await options!.onCreatedNotifications!([{ user_id: 'user-5', id: 'notification-5' }])
      return { created: 2, pruned: 0 }
    })

    await expect(
      runReconcileRssFeedItemNotifications({ rssFeedItemId: 'item-1' }),
    ).resolves.toEqual({
      created: 2,
      pruned: 0,
    })

    expect(mockEnqueueBulkDeliverNotificationPushIntents).toHaveBeenNthCalledWith(1, [
      { userId: 'user-4', notificationId: 'notification-4' },
    ])
    expect(mockEnqueueBulkDeliverNotificationPushIntents).toHaveBeenNthCalledWith(2, [
      { userId: 'user-5', notificationId: 'notification-5' },
    ])
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
    await createFollowNotification(recipient.id, follower.id, follower.username)
    const result = await processReconcileNotificationPushIntents()
    expect(result.enqueued).toBeGreaterThan(0)
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
function runConversationMessageNotification(data: {
  conversationId: string
  messageId: string
  senderId: string
}) {
  return processConversationMessageNotification(data, {
    enqueueBulkDeliverNotificationPushIntents: mockEnqueueBulkDeliverNotificationPushIntents,
  })
}

function runReconcilePostNotifications(data: { postId: string }) {
  return processReconcilePostNotifications(data, {
    enqueueBulkDeliverNotificationPushIntents: mockEnqueueBulkDeliverNotificationPushIntents,
    reconcileNotificationsForPost: mockReconcileNotificationsForPost,
  })
}

function runReconcileRssFeedItemNotifications(data: { rssFeedItemId: string }) {
  return processReconcileRssFeedItemNotifications(data, {
    enqueueBulkDeliverNotificationPushIntents: mockEnqueueBulkDeliverNotificationPushIntents,
    reconcileNotificationsForRssFeedItem: mockReconcileNotificationsForRssFeedItem,
  })
}
