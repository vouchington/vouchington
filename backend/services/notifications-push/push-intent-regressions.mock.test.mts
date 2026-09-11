import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush, { type SendResult } from 'web-push'
import {
  claimTestLegacyNotificationPush,
  createTestDirectConversation,
  createTestManualPostNotification,
  createTestOrphanRssFeedItemNotification,
  createTestSubscriptionPostNotification,
  createTestPost,
  createTestUserDirect,
  expireTestNotificationPushIntentLease,
  getNotificationById,
  getTestNotificationPushIntent,
  getTestNotificationPushReceipt,
  getTestWebPushSubscription,
  markTestNotificationPushed,
} from '@voucha/test-helpers'
import { createDirectMessageNotification } from '@services/notifications/create-direct-message-notification'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { deleteNotification } from '@services/notifications/mutations'
import { upsertWebPushSubscription } from '@services/notifications/push-subscriptions'
import { deliverClaimedNotificationPushIntent } from './push-intent-delivery.mts'
import { persistClaimedNotificationPushOutcome } from './push-intent-results.mts'
import { claimNotificationPushIntent } from './push-intents.mts'

vi.mock<typeof import('web-push')>(import('web-push'), async importActual => {
  const actual = await importActual()
  const mockedModule = {
    ...actual,
    sendNotification: vi.fn<typeof actual.sendNotification>(),
    setVapidDetails: vi.fn<typeof actual.setVapidDetails>(),
  }
  return { ...mockedModule, default: mockedModule }
})

describe('durable notification push regressions', () => {
  beforeAll(() => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'test-public-key'
    process.env.WEB_PUSH_PRIVATE_KEY = 'test-private-key'
    process.env.WEB_PUSH_SUBJECT = 'mailto:tests+push-intent-regressions@voucha.ai'
  })

  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset()
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())
  })

  it('rotates a direct-message notification intent and clears prior endpoint receipts', async () => {
    const sender = await createTestUserDirect()
    const recipient = await createTestUserDirect()
    const conversation = await createTestDirectConversation({
      user1Id: sender.id,
      user2Id: recipient.id,
    })
    const subscription = await createSubscription(recipient.id, 'rotation')
    const [first] = await createDirectMessageNotification(recipient.id, conversation.id)
    const firstIntent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: first!.id },
      120,
    )
    await expect(getNotificationById(first!.id)).resolves.toMatchObject({
      pushed_at: expect.any(Date),
    })
    await expect(claimTestLegacyNotificationPush(recipient.id, first!.id)).resolves.toBe(false)
    await deliverClaimedNotificationPushIntent(firstIntent!)
    await expect(
      claimNotificationPushIntent({ user_id: recipient.id, notification_id: first!.id }, 120),
    ).resolves.toBeUndefined()
    await expect(getNotificationById(first!.id)).resolves.toMatchObject({
      pushed_at: expect.any(Date),
    })

    const [second] = await createDirectMessageNotification(recipient.id, conversation.id)
    expect(second!.id).not.toBe(first!.id)
    await expect(
      getTestNotificationPushReceipt(recipient.id, second!.id, subscription.id),
    ).resolves.toBeUndefined()
    const secondIntent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: second!.id },
      120,
    )
    await expect(deliverClaimedNotificationPushIntent(secondIntent!)).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('rejects stale lease outcomes and keeps endpoint receipts terminal', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const subscription = await createSubscription(recipient.id, 'lease-fence')
    const oldIntent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notification!.id },
      120,
    )
    await expireTestNotificationPushIntentLease(recipient.id, notification!.id)
    const currentIntent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notification!.id },
      120,
    )
    const success = { kind: 'delivered' as const, subscription }

    await expect(persistClaimedNotificationPushOutcome(oldIntent!, success)).resolves.toBe(
      'lease_lost',
    )
    await expect(
      getTestNotificationPushReceipt(recipient.id, notification!.id, subscription.id),
    ).resolves.toBeUndefined()
    await expect(persistClaimedNotificationPushOutcome(currentIntent!, success)).resolves.toBe(
      'persisted',
    )
    const subscriptionBeforeInvalidation = await getTestWebPushSubscription(
      recipient.id,
      subscription.id,
    )
    await expect(
      persistClaimedNotificationPushOutcome(currentIntent!, {
        kind: 'subscription_invalid',
        subscription,
      }),
    ).resolves.toBe('persisted')
    await expect(
      getTestNotificationPushReceipt(recipient.id, notification!.id, subscription.id),
    ).resolves.toMatchObject({
      status: 'delivered',
      delivered_at: expect.any(Date),
      permanently_failed_at: null,
    })
    await expect(getTestWebPushSubscription(recipient.id, subscription.id)).resolves.toMatchObject({
      deleted_at: null,
      last_failure_at: subscriptionBeforeInvalidation?.last_failure_at,
    })
  })

  it('delivers a valid manual send for a registered-audience post', async () => {
    const sender = await createTestUserDirect()
    const recipient = await createTestUserDirect()
    const author = await createTestUserDirect()
    const post = await createTestPost({ user: author, privacy: 'public', broadcast: 'users' })
    const notificationId = await createTestManualPostNotification({
      userId: recipient.id,
      sentByUserId: sender.id,
      postId: post.id,
    })
    await createSubscription(recipient.id, 'registered-audience')

    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notificationId },
      120,
    )
    await expect(deliverClaimedNotificationPushIntent(intent!)).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })
    expect(webpush.sendNotification).toHaveBeenCalledOnce()
  })

  it('delivers a subscription notification to its registered-audience recipient', async () => {
    const recipient = await createTestUserDirect()
    const author = await createTestUserDirect()
    const post = await createTestPost({ user: author, privacy: 'public', broadcast: 'users' })
    const notificationId = await createTestSubscriptionPostNotification({
      userId: recipient.id,
      postId: post.id,
    })
    await createSubscription(recipient.id, 'subscription-registered-audience')

    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notificationId },
      120,
    )
    await expect(deliverClaimedNotificationPushIntent(intent!)).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })
    expect(webpush.sendNotification).toHaveBeenCalledOnce()
  })

  it('suppresses an orphaned RSS notification without a retained publication target', async () => {
    const sender = await createTestUserDirect()
    const recipient = await createTestUserDirect()
    const notificationId = await createTestOrphanRssFeedItemNotification({
      userId: recipient.id,
      sentByUserId: sender.id,
      publicationRssFeedItemId: null,
    })
    await createSubscription(recipient.id, 'orphan-rss-target')

    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notificationId },
      120,
    )
    await expect(deliverClaimedNotificationPushIntent(intent!)).resolves.toEqual({
      delivered: 0,
      suppressed: true,
    })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('keeps the legacy claim fence after suppressing ineligible content', async () => {
    const sender = await createTestUserDirect()
    const recipient = await createTestUserDirect()
    const author = await createTestUserDirect()
    const post = await createTestPost({ user: author, privacy: 'private', broadcast: 'users' })
    const notificationId = await createTestManualPostNotification({
      userId: recipient.id,
      sentByUserId: sender.id,
      postId: post.id,
    })
    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notificationId },
      120,
    )

    await expect(deliverClaimedNotificationPushIntent(intent!)).resolves.toEqual({
      delivered: 0,
      suppressed: true,
    })
    await expect(claimTestLegacyNotificationPush(recipient.id, notificationId)).resolves.toBe(false)
  })

  it('terminalizes an intent completed by a legacy worker', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    await createSubscription(recipient.id, 'legacy-retry')
    await markTestNotificationPushed(notification!.id)

    await expect(
      claimNotificationPushIntent(
        { user_id: recipient.id, notification_id: notification!.id },
        120,
      ),
    ).resolves.toBeUndefined()
    expect(webpush.sendNotification).not.toHaveBeenCalled()
    await expect(
      getTestNotificationPushIntent(recipient.id, notification!.id),
    ).resolves.toMatchObject({
      status: 'delivered',
      delivered_at: expect.any(Date),
    })
  })

  it('terminalizes a pending intent after its notification is soft-deleted', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    await deleteNotification(recipient.id, notification!.id)

    await expect(
      claimNotificationPushIntent(
        { user_id: recipient.id, notification_id: notification!.id },
        120,
      ),
    ).resolves.toBeUndefined()
    await expect(
      getTestNotificationPushIntent(recipient.id, notification!.id),
    ).resolves.toMatchObject({
      status: 'suppressed',
      suppressed_at: expect.any(Date),
    })
  })
})

async function createSubscription(userId: string, label: string) {
  return upsertWebPushSubscription({
    userId,
    endpoint: `https://push.example.com/${label}`,
    p256dh: `${label}-p256dh-secret`,
    auth: `${label}-auth-secret`,
    expirationTimeMs: null,
    userAgent: 'vitest',
  })
}

function successfulSendResult(): SendResult {
  return { statusCode: 201, body: '', headers: {} }
}
