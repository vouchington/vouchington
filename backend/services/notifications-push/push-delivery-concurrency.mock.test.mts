import { beforeAll, describe, expect, it, vi } from 'vitest'
import webpush, { type SendResult } from 'web-push'
import { createTestUserDirect } from '@voucha/test-helpers'
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
    const intent = await createDelivery(6)
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
    expect(maxInFlight).toBe(5)
    release.resolve()
    await delivery
  })

  it('releases instead of finalizing when an in-flight subscription generation becomes stale', async () => {
    const intent = await createDelivery(2)
    let persistenceAttempts = 0
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())

    await expect(
      deliverClaimedNotificationPushIntent(intent, undefined, {
        persist: async () => {
          persistenceAttempts++
          return persistenceAttempts === 1 ? 'subscription_stale' : 'persisted'
        },
      }),
    ).rejects.toThrow('subscription generation changed during delivery')
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
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
  await Promise.all(
    Array.from({ length: endpointCount }, (_, index) =>
      upsertWebPushSubscription({
        userId: recipient.id,
        endpoint: `https://push.example.com/${index}-${crypto.randomUUID()}`,
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
  return intent
}

function successfulSendResult(): SendResult {
  return { statusCode: 201, body: '', headers: {} }
}
