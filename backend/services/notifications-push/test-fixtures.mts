import { expect, vi } from 'vitest'
import type { SendResult } from 'web-push'
import {
  createTestUserDirect,
  getTestNotificationPushReceipt,
  getTestNotificationPushIntentLeaseExpiry,
} from '@voucha/test-helpers'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { upsertWebPushSubscription } from '@services/notifications/push-subscriptions'
import { claimNotificationPushIntent } from './push-intents.mts'

export async function createDelivery(leaseSeconds = 120, endpointCount = 2) {
  const [recipient, follower] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
  const [notification] = await createFollowNotification(
    recipient.id,
    follower.id,
    follower.username,
  )
  const endpoints = Array.from(
    { length: endpointCount },
    (_, index) => `https://push.example.com/${index}-${crypto.randomUUID()}`,
  )
  const [prompt, slow] = endpoints
  const subscriptions = await Promise.all(
    endpoints.map(endpoint => addSubscription(recipient.id, endpoint!)),
  )
  const intent = await claimNotificationPushIntent(
    { user_id: recipient.id, notification_id: notification!.id },
    leaseSeconds,
  )
  if (!intent) throw new Error('Expected notification push intent claim')
  return { intent, prompt, promptSubscriptionId: subscriptions[0]!.id, slow }
}

async function addSubscription(userId: string, endpoint: string) {
  return upsertWebPushSubscription({
    userId,
    endpoint,
    p256dh: `${endpoint}-p256dh`,
    auth: `${endpoint}-auth`,
    expirationTimeMs: null,
    userAgent: 'vitest',
  })
}

export async function getLeaseExpiry(intent: {
  user_id: string
  notification_id: string
}): Promise<number> {
  return getTestNotificationPushIntentLeaseExpiry(intent.user_id, intent.notification_id)
}

export async function waitForDeliveredEndpoint(
  intent: Awaited<ReturnType<typeof claimNotificationPushIntent>> & {},
  subscriptionId: string,
) {
  await vi.waitFor(async () => {
    await expect(
      getTestNotificationPushReceipt(intent.user_id, intent.notification_id, subscriptionId),
    ).resolves.toMatchObject({ status: 'delivered' })
  })
}

export function successfulSendResult(): SendResult {
  return { statusCode: 201, body: '', headers: {} }
}
