import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush, { type SendResult } from 'web-push'
import {
  createTestSubscriptionPostNotification,
  createTestPost,
  createTestUserDirect,
  expireTestNotificationPushIntentLease,
  getTestNotificationPushReceipt,
  setTestPostClearanceStatus,
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

describe('deliverClaimedNotificationPushIntent lease and configuration branches', () => {
  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset()
    vi.mocked(webpush.setVapidDetails).mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('releases its claim when Web Push configuration is unavailable', async () => {
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', '')
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', '')
    vi.stubEnv('WEB_PUSH_SUBJECT', '')
    const { recipient, notificationId } = await createNotification()
    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notificationId },
      120,
    )

    await expect(deliverClaimedNotificationPushIntent(intent!)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })
    await expect(
      claimNotificationPushIntent({ user_id: recipient.id, notification_id: notificationId }, 120),
    ).resolves.toEqual(expect.objectContaining({ notification_id: notificationId }))
  })

  it('does not finalize delivery when its lease is superseded while sending', async () => {
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'test-public-key')
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'test-private-key')
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:tests+push-branches@voucha.ai')
    const { recipient, notificationId } = await createNotification()
    await upsertWebPushSubscription({
      userId: recipient.id,
      endpoint: `https://push.example.com/lease-superseded-${crypto.randomUUID()}`,
      p256dh: 'lease-superseded-p256dh',
      auth: 'lease-superseded-auth',
      expirationTimeMs: null,
      userAgent: 'vitest',
    })
    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notificationId },
      120,
    )
    vi.mocked(webpush.sendNotification).mockImplementationOnce(async () => {
      await expireTestNotificationPushIntentLease(recipient.id, notificationId)
      return successfulSendResult()
    })

    await expect(deliverClaimedNotificationPushIntent(intent!)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })
  })

  it('releases and retries the replacement after an endpoint generation changes while sending', async () => {
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'test-public-key')
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'test-private-key')
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:tests+push-generation-retry@voucha.ai')
    const { recipient, notificationId } = await createNotification()
    const endpoint = `https://push.example.com/generation-retry-${crypto.randomUUID()}`
    await upsertWebPushSubscription({
      userId: recipient.id,
      endpoint,
      p256dh: 'generation-retry-old-p256dh',
      auth: 'generation-retry-old-auth',
      expirationTimeMs: null,
      userAgent: 'vitest',
    })
    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notificationId },
      120,
    )
    let replacementId: string | undefined
    vi.mocked(webpush.sendNotification).mockImplementationOnce(async () => {
      const replacement = await upsertWebPushSubscription({
        userId: recipient.id,
        endpoint,
        p256dh: 'generation-retry-new-p256dh',
        auth: 'generation-retry-new-auth',
        expirationTimeMs: null,
        userAgent: 'vitest',
      })
      replacementId = replacement.id
      return successfulSendResult()
    })

    await expect(deliverClaimedNotificationPushIntent(intent!)).rejects.toThrow(
      'subscription generation changed during delivery',
    )
    const retry = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notificationId },
      120,
    )
    await expect(deliverClaimedNotificationPushIntent(retry!)).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })
    await expect(
      getTestNotificationPushReceipt(recipient.id, notificationId, replacementId!),
    ).resolves.toMatchObject({ status: 'delivered' })
  })

  it('suppresses a content push after its author loses publication clearance', async () => {
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'test-public-key')
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'test-private-key')
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:tests+push-clearance@voucha.ai')
    const author = await createTestUserDirect()
    const post = await createTestPost({ user: author })
    const notificationId = await createTestSubscriptionPostNotification({
      userId: author.id,
      postId: post.id,
    })
    await setTestPostClearanceStatus(post.id, 'pending', author.id)
    const intent = await claimNotificationPushIntent(
      { user_id: author.id, notification_id: notificationId },
      120,
    )

    await expect(deliverClaimedNotificationPushIntent(intent!)).resolves.toEqual({
      delivered: 0,
      suppressed: true,
    })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })
})

async function createNotification() {
  const recipient = await createTestUserDirect()
  const follower = await createTestUserDirect()
  const [notification] = await createFollowNotification(
    recipient.id,
    follower.id,
    follower.username,
  )
  return { recipient, notificationId: notification!.id }
}

function successfulSendResult(): SendResult {
  return { statusCode: 201, body: '', headers: {} }
}
