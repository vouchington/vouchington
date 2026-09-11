import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush, { type SendResult } from 'web-push'
import {
  createTestUserDirect,
  getTestNotificationPushReceipt,
  getTestWebPushSubscription,
} from '@voucha/test-helpers'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { upsertWebPushSubscription } from '@services/notifications/push-subscriptions'
import { deliverClaimedNotificationPushIntent } from './push-intent-delivery.mts'
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

describe('notification push response policy', () => {
  beforeAll(() => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'test-public-key'
    process.env.WEB_PUSH_PRIVATE_KEY = 'test-private-key'
    process.env.WEB_PUSH_SUBJECT = 'mailto:tests+push-response-policy@voucha.ai'
  })

  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset()
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())
  })

  it.each([404, 410])('invalidates status %s endpoints', async statusCode => {
    const { notificationId, recipient, subscription } = await createDelivery('terminal')
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(providerError(statusCode))

    await expect(deliverIntent(recipient.id, notificationId)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })
    await expectTerminalReceipt(recipient.id, notificationId, subscription.id)
    await expect(getTestWebPushSubscription(recipient.id, subscription.id)).resolves.toMatchObject({
      deleted_at: expect.any(Date),
      last_failure_at: expect.any(Date),
    })
  })

  it.each([300, 301, 400, 401, 403, 413, 451, 499])(
    'terminalizes status %s without invalidating its endpoint',
    async statusCode => {
      const { notificationId, recipient, subscription } = await createDelivery('terminal')
      vi.mocked(webpush.sendNotification).mockRejectedValueOnce(providerError(statusCode))

      await expect(deliverIntent(recipient.id, notificationId)).resolves.toEqual({
        delivered: 0,
        suppressed: false,
      })
      await expectTerminalReceipt(recipient.id, notificationId, subscription.id)
      await expect(
        getTestWebPushSubscription(recipient.id, subscription.id),
      ).resolves.toMatchObject({
        deleted_at: null,
        last_failure_at: expect.any(Date),
      })
    },
  )

  it.each([
    [{ statusCode: 408 }],
    [{ statusCode: 429 }],
    [{ statusCode: 500 }],
    [{ statusCode: 599 }],
    [new Error('network failure')],
    [{ statusCode: 99 }],
    [{ statusCode: '500' }],
    [{ statusCode: 500.5 }],
    [{ statusCode: 600 }],
    [{ statusCode: 200 }],
  ])('retries transport, transient, and malformed provider failures', async error => {
    const { notificationId, recipient, subscription } = await createDelivery('retryable')
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(error)

    await expect(deliverIntent(recipient.id, notificationId)).rejects.toThrow(
      'Transient web push delivery failure',
    )
    await expect(
      getTestNotificationPushReceipt(recipient.id, notificationId, subscription.id),
    ).resolves.toBeUndefined()
    await expect(getTestWebPushSubscription(recipient.id, subscription.id)).resolves.toMatchObject({
      deleted_at: null,
      last_failure_at: expect.any(Date),
    })
  })

  it('retries only retryable endpoints after terminal outcomes persist', async () => {
    const { notificationId, recipient, subscription } = await createDelivery('terminal-mixed')
    const retryable = await addSubscription(recipient.id, 'retryable-mixed')
    vi.mocked(webpush.sendNotification).mockImplementation(async subscriptionInput => {
      if (subscriptionInput.endpoint === subscription.endpoint) throw providerError(400)
      throw providerError(500)
    })

    await expect(deliverIntent(recipient.id, notificationId)).rejects.toThrow(
      'Transient web push delivery failure',
    )
    await expect(
      getTestNotificationPushReceipt(recipient.id, notificationId, subscription.id),
    ).resolves.toMatchObject({ status: 'permanently_failed' })
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())

    await expect(deliverIntent(recipient.id, notificationId)).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(3)
    expect(vi.mocked(webpush.sendNotification).mock.calls[2]?.[0].endpoint).toBe(retryable.endpoint)
  })

  it('preserves notification-terminal subscriptions for later notifications', async () => {
    const { notificationId, recipient, subscription } = await createDelivery('preserved')
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce({ statusCode: 413 })
    await expect(deliverIntent(recipient.id, notificationId)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })
    await expect(
      claimNotificationPushIntent({ user_id: recipient.id, notification_id: notificationId }, 120),
    ).resolves.toBeUndefined()
    expect(webpush.sendNotification).toHaveBeenCalledOnce()

    const nextFollower = await createTestUserDirect()
    const [next] = await createFollowNotification(
      recipient.id,
      nextFollower.id,
      nextFollower.username,
    )
    vi.mocked(webpush.sendNotification).mockResolvedValueOnce(successfulSendResult())
    await expect(deliverIntent(recipient.id, next!.id)).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
    await expect(getTestWebPushSubscription(recipient.id, subscription.id)).resolves.toMatchObject({
      deleted_at: null,
      last_success_at: expect.any(Date),
    })
  })
})

async function createDelivery(label: string) {
  const recipient = await createTestUserDirect()
  const follower = await createTestUserDirect()
  const [notification] = await createFollowNotification(
    recipient.id,
    follower.id,
    follower.username,
  )
  const subscription = await addSubscription(recipient.id, label)
  return { notificationId: notification!.id, recipient, subscription }
}

async function addSubscription(userId: string, label: string) {
  return upsertWebPushSubscription({
    userId,
    endpoint: `https://push.example.com/${label}`,
    p256dh: `${label}-p256dh-secret`,
    auth: `${label}-auth-secret`,
    expirationTimeMs: null,
    userAgent: 'vitest',
  })
}

async function deliverIntent(userId: string, notificationId: string) {
  const intent = await claimNotificationPushIntent(
    { user_id: userId, notification_id: notificationId },
    120,
  )
  if (!intent) throw new Error(`Notification push intent ${notificationId} was not claimable`)
  return deliverClaimedNotificationPushIntent(intent)
}

function successfulSendResult(): SendResult {
  return { statusCode: 201, body: '', headers: {} }
}

async function expectTerminalReceipt(
  userId: string,
  notificationId: string,
  subscriptionId: string,
) {
  await expect(
    getTestNotificationPushReceipt(userId, notificationId, subscriptionId),
  ).resolves.toMatchObject({
    status: 'permanently_failed',
    permanently_failed_at: expect.any(Date),
  })
}

function providerError(statusCode: unknown) {
  return Object.assign(new Error('provider response'), { statusCode })
}
