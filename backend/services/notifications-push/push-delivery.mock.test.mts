import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush, { type SendResult } from 'web-push'
import {
  claimTestLegacyNotificationPush,
  createTestUserDirect,
  getNotificationById,
  getTestWebPushSubscription,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import {
  listWebPushSubscriptionsPage,
  upsertWebPushSubscription,
} from '@services/notifications/push-subscriptions'
import { deliverClaimedNotificationPushIntent } from './push-intent-delivery.mts'
import { claimNotificationPushIntent } from './push-intents.mts'
import {
  createCommunityActivityDigestBatch,
  createCommunityLifecycleNotification,
} from '@services/notifications'

vi.mock<typeof import('web-push')>(import('web-push'), async importActual => {
  const actual = await importActual()
  const mockedModule = {
    ...actual,
    sendNotification: vi.fn<typeof actual.sendNotification>(),
    setVapidDetails: vi.fn<typeof actual.setVapidDetails>(),
  }

  return { ...mockedModule, default: mockedModule }
})

describe('deliverClaimedNotificationPushIntent', () => {
  beforeAll(() => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'test-public-key'
    process.env.WEB_PUSH_PRIVATE_KEY = 'test-private-key'
    process.env.WEB_PUSH_SUBJECT = 'mailto:tests+push-delivery@voucha.ai'
  })

  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset()
    vi.mocked(webpush.sendNotification).mockResolvedValue(createSuccessfulSendResult())
    vi.mocked(webpush.setVapidDetails).mockClear()
  })

  it('sends browser push to active unexpired subscriptions', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    await upsertWebPushSubscription({
      userId: recipient.id,
      endpoint: 'https://push.example.com/active-subscription',
      p256dh: 'active-p256dh-secret',
      auth: 'active-auth-secret',
      expirationTimeMs: Date.now() + 60_000,
      userAgent: 'vitest',
    })

    await expect(deliverNotificationIntent(recipient.id, notification!.id)).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example.com/active-subscription',
        keys: {
          p256dh: 'active-p256dh-secret',
          auth: 'active-auth-secret',
        },
      },
      expect.stringContaining(`${follower.username} started following you`),
      expect.objectContaining({ agent: expect.anything(), timeout: 30_000 }),
    )
  })

  it('includes structured community navigation in lifecycle pushes', async () => {
    const recipient = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: recipient.id })
    const notification = await createCommunityLifecycleNotification(
      {
        userId: recipient.id,
        communityId: community.id,
        entityType: 'community_role_change',
        eventKey: `push-structured-community:${community.id}`,
        title: 'Community role changed',
        body: 'Your community role changed.',
      },
      {},
    )
    await upsertWebPushSubscription({
      userId: recipient.id,
      endpoint: 'https://push.example.com/structured-target',
      p256dh: 'structured-p256dh-secret',
      auth: 'structured-auth-secret',
      expirationTimeMs: null,
      userAgent: 'vitest',
    })

    await expect(
      deliverNotificationIntent(recipient.id, notification!.notificationId),
    ).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })
    const payload = vi.mocked(webpush.sendNotification).mock.calls[0]![1]
    expect(parseWebPushPayload(payload)).toMatchObject({
      notification_id: notification!.notificationId,
      target_intent: null,
      url: `/communities/${encodeURIComponent(community.slug)}`,
      target_entity: {
        __entity_type: 'community',
        id: community.id,
        slug: community.slug,
      },
    })
  })

  it('includes a legacy inbox URL in structured community digest pushes', async () => {
    const recipient = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: recipient.id })
    const now = new Date()
    const windowStart = new Date(now.getTime() - 3_600_000)
    const windowEnd = new Date(now.getTime() + 3_600_000)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: recipient.id,
      role: 'owner',
      createdAt: now,
    })
    const compactUserId = recipient.id.replaceAll('-', '')
    const precedingUserId = (BigInt(`0x${compactUserId}`) - 1n)
      .toString(16)
      .padStart(32, '0')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.*)$/, '$1-$2-$3-$4-$5')
    const batch = await createCommunityActivityDigestBatch({
      windowStart,
      windowEnd,
      afterUserId: precedingUserId,
    })
    const notification = batch.created.find(item => item.userId === recipient.id)!
    await upsertWebPushSubscription({
      userId: recipient.id,
      endpoint: 'https://push.example.com/structured-digest-target',
      p256dh: 'structured-digest-p256dh-secret',
      auth: 'structured-digest-auth-secret',
      expirationTimeMs: null,
      userAgent: 'vitest',
    })

    await expect(
      deliverNotificationIntent(recipient.id, notification.notificationId),
    ).resolves.toEqual({ delivered: 1, suppressed: false })
    const payload = vi.mocked(webpush.sendNotification).mock.calls[0]![1]
    expect(parseWebPushPayload(payload)).toMatchObject({
      notification_id: notification.notificationId,
      target_intent: 'notifications_inbox',
      url: '/my/notifications',
    })
  })

  it('soft-deletes expired subscriptions before delivery', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    await upsertWebPushSubscription({
      userId: recipient.id,
      endpoint: 'https://push.example.com/expired-subscription',
      p256dh: 'expired-p256dh-secret',
      auth: 'expired-auth-secret',
      expirationTimeMs: Date.now() - 60_000,
      userAgent: 'vitest',
    })

    await expect(deliverNotificationIntent(recipient.id, notification!.id)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })

    expect(webpush.sendNotification).not.toHaveBeenCalled()
    await expect(listSubscriptionResults(recipient.id)).resolves.toEqual([])
  })

  it('soft-deletes permanently rejected push endpoints', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const subscription = await upsertWebPushSubscription({
      userId: recipient.id,
      endpoint: 'https://push.example.com/gone-subscription',
      p256dh: 'gone-p256dh-secret',
      auth: 'gone-auth-secret',
      expirationTimeMs: null,
      userAgent: 'vitest',
    })
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce({ statusCode: 410 })

    await expect(deliverNotificationIntent(recipient.id, notification!.id)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    await expect(listSubscriptionResults(recipient.id)).resolves.toEqual([])
    await expect(getTestWebPushSubscription(recipient.id, subscription.id)).resolves.toMatchObject({
      deleted_at: expect.any(Date),
      last_failure_at: expect.any(Date),
    })
  })

  it('releases the durable lease without reopening the legacy delivery path', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    await upsertWebPushSubscription({
      userId: recipient.id,
      endpoint: 'https://push.example.com/retryable-subscription',
      p256dh: 'retryable-p256dh-secret',
      auth: 'retryable-auth-secret',
      expirationTimeMs: null,
      userAgent: 'vitest',
    })
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce({ statusCode: 500 })

    await expect(deliverNotificationIntent(recipient.id, notification!.id)).rejects.toThrow(
      'Transient web push delivery failure',
    )

    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
    await expect(getNotificationById(notification!.id)).resolves.toMatchObject({
      pushed_at: expect.any(Date),
    })
    await expect(claimTestLegacyNotificationPush(recipient.id, notification!.id)).resolves.toBe(
      false,
    )

    vi.mocked(webpush.sendNotification).mockResolvedValueOnce(createSuccessfulSendResult())
    await expect(deliverNotificationIntent(recipient.id, notification!.id)).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
  })
})

function createSuccessfulSendResult(): SendResult {
  return { statusCode: 201, body: '', headers: {} }
}

async function deliverNotificationIntent(userId: string, notificationId: string) {
  const intent = await claimNotificationPushIntent(
    { user_id: userId, notification_id: notificationId },
    120,
  )
  if (!intent) throw new Error(`Notification push intent ${notificationId} was not claimable`)
  return deliverClaimedNotificationPushIntent(intent)
}

function parseWebPushPayload(payload: string | Buffer | null | undefined): unknown {
  if (typeof payload === 'string') return JSON.parse(payload)
  if (Buffer.isBuffer(payload)) return JSON.parse(payload.toString('utf8'))
  throw new TypeError('Expected web push payload to contain JSON')
}

async function listSubscriptionResults(userId: string) {
  return (await listWebPushSubscriptionsPage(userId, { limit: 100 })).results
}
