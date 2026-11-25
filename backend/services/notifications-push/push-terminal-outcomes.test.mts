import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  expireTestNotificationPushIntentLease,
  getTestNotificationPushReceipt,
  getTestWebPushSubscription,
} from '@voucha/test-helpers'
import { getTestWebPushEndpointOwner } from '@voucha/test-helpers/web-push'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { upsertWebPushSubscription } from '@services/notifications/push-subscriptions'
import { persistClaimedNotificationPushOutcome } from './push-intent-results.mts'
import { claimNotificationPushIntent } from './push-intents.mts'

describe('terminal push outcomes', () => {
  it('rejects stale lease outcomes and keeps endpoint receipts terminal', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const subscription = await createSubscription(recipient.id)
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
    const receiptBeforeReplay = await getTestNotificationPushReceipt(
      recipient.id,
      notification!.id,
      subscription.id,
    )
    await expect(persistClaimedNotificationPushOutcome(currentIntent!, success)).resolves.toBe(
      'persisted',
    )
    await expect(
      persistClaimedNotificationPushOutcome(currentIntent!, {
        kind: 'subscription_invalid',
        subscription,
      }),
    ).resolves.toBe('persisted')
    await expect(
      getTestNotificationPushReceipt(recipient.id, notification!.id, subscription.id),
    ).resolves.toEqual(receiptBeforeReplay)
    expect(receiptBeforeReplay).toMatchObject({
      status: 'delivered',
      delivered_at: expect.any(Date),
      permanently_failed_at: null,
    })
    await expect(getTestWebPushSubscription(recipient.id, subscription.id)).resolves.toEqual(
      subscriptionBeforeInvalidation,
    )
    await expect(getTestWebPushEndpointOwner(subscription.endpoint)).resolves.toEqual({
      user_id: recipient.id,
      subscription_id: subscription.id,
    })
  })

  it('replays an invalid outcome without retiring the replacement or changing the receipt', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const subscription = await createSubscription(recipient.id)
    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notification!.id },
      120,
    )
    const invalid = { kind: 'subscription_invalid' as const, subscription }
    await expect(persistClaimedNotificationPushOutcome(intent!, invalid)).resolves.toBe('persisted')
    await expect(getTestWebPushEndpointOwner(subscription.endpoint)).resolves.toBeUndefined()
    const retired = await getTestWebPushSubscription(recipient.id, subscription.id)
    expect(retired).toMatchObject({
      deleted_at: expect.any(Date),
      last_failure_at: expect.any(Date),
    })
    const receipt = await getTestNotificationPushReceipt(
      recipient.id,
      notification!.id,
      subscription.id,
    )
    expect(receipt).toMatchObject({
      status: 'permanently_failed',
      permanently_failed_at: expect.any(Date),
    })

    const replacement = await createSubscription(recipient.id, subscription.endpoint)
    await expect(persistClaimedNotificationPushOutcome(intent!, invalid)).resolves.toBe(
      'subscription_stale',
    )
    await expect(
      getTestNotificationPushReceipt(recipient.id, notification!.id, subscription.id),
    ).resolves.toEqual(receipt)
    await expect(getTestWebPushSubscription(recipient.id, subscription.id)).resolves.toEqual(
      retired,
    )
    await expect(getTestWebPushEndpointOwner(subscription.endpoint)).resolves.toEqual({
      user_id: recipient.id,
      subscription_id: replacement.id,
    })
    await expect(getTestWebPushSubscription(recipient.id, replacement.id)).resolves.toMatchObject({
      deleted_at: null,
      last_failure_at: null,
    })
  })
})

function createSubscription(
  userId: string,
  endpoint = `https://push.example.test/${crypto.randomUUID()}`,
) {
  return upsertWebPushSubscription({
    userId,
    endpoint,
    p256dh: 'p'.repeat(32),
    auth: 'a'.repeat(16),
  })
}
