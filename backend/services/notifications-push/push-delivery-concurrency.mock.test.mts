import { beforeAll, describe, expect, it, vi } from 'vitest'
import webpush, { type SendResult } from 'web-push'
import { createTestUserDirect } from '@voucha/test-helpers'
import { getIntentState, getLeaseExpiry } from '@voucha/test-helpers/notification-push-fixtures'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { upsertWebPushSubscription } from '@services/notifications/push-subscriptions'
import { claimNotificationPushIntent, deliverClaimedNotificationPushIntent } from './index.mts'

vi.mock<typeof import('web-push')>(import('web-push'), async importActual => {
  const actual = await importActual()
  const mockedModule = {
    ...actual,
    sendNotification: vi.fn<typeof actual.sendNotification>(),
    setVapidDetails: vi.fn<typeof actual.setVapidDetails>(),
  }
  return { ...mockedModule, default: mockedModule }
})

describe('notification push delivery concurrency', () => {
  beforeAll(() => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'test-public-key'
    process.env.WEB_PUSH_PRIVATE_KEY = 'test-private-key'
    process.env.WEB_PUSH_SUBJECT = 'mailto:tests+push-concurrency@voucha.ai'
  })

  it('caps production delivery concurrency at five', async () => {
    const { intent } = await createDelivery(6)
    let inFlight = 0
    let maxInFlight = 0
    const saturated = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    vi.mocked(webpush.sendNotification).mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      if (inFlight === 5) saturated.resolve()
      await release.promise
      inFlight--
      return successfulSendResult()
    })

    const delivery = deliverClaimedNotificationPushIntent(intent)
    await saturated.promise
    // A real database round trip lets any sixth send that production would wrongly start begin first.
    await getLeaseExpiry(intent)
    expect(webpush.sendNotification).toHaveBeenCalledTimes(5)
    expect(maxInFlight).toBe(5)
    release.resolve()
    await delivery
  })

  it('releases instead of finalizing when an in-flight subscription generation becomes stale', async () => {
    const { intent, recipientId, endpoints } = await createDelivery(2)
    vi.mocked(webpush.sendNotification).mockImplementation(async subscription => {
      if (subscription.endpoint === endpoints[0]) {
        await upsertWebPushSubscription({
          userId: recipientId,
          endpoint: endpoints[0],
          p256dh: 'p256dh-replacement'.padEnd(32, 'x'),
          auth: 'auth-replacement'.padEnd(16, 'x'),
          expirationTimeMs: null,
          userAgent: 'vitest',
        })
      }
      return successfulSendResult()
    })

    await expect(deliverClaimedNotificationPushIntent(intent)).rejects.toThrow(
      `Web Push subscription generation changed during delivery for notification ${intent.notification_id}`,
    )
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
    await expect(getIntentState(intent)).resolves.toMatchObject({ delivered_at: null })
  })
})

async function createDelivery(endpointCount: number) {
  const recipient = await createTestUserDirect()
  const follower = await createTestUserDirect()
  const [notification] = await createFollowNotification(
    recipient.id,
    follower.id,
    follower.username,
  )
  const endpoints = Array.from(
    { length: endpointCount },
    (_, index) => `https://push.example.com/${index}-${crypto.randomUUID()}`,
  )
  await Promise.all(
    endpoints.map((endpoint, index) =>
      upsertWebPushSubscription({
        userId: recipient.id,
        endpoint,
        p256dh: `p256dh-${index}`.padEnd(32, 'x'),
        auth: `auth-${index}`.padEnd(16, 'x'),
        expirationTimeMs: null,
        userAgent: 'vitest',
      }),
    ),
  )
  const intent = await claimNotificationPushIntent(
    { user_id: recipient.id, notification_id: notification!.id },
    120,
  )
  if (!intent) throw new Error('Expected notification push intent claim')
  return { intent, recipientId: recipient.id, endpoints }
}

function successfulSendResult(): SendResult {
  return { statusCode: 201, body: '', headers: {} }
}
