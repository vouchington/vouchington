import { describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  getTestNotificationPushReceipt,
  getTestWebPushSubscription,
  holdTestWebPushEndpointOwnershipReplacement,
} from '@voucha/test-helpers'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { upsertWebPushSubscription } from '@services/notifications/push-subscriptions'
import { persistClaimedNotificationPushOutcome } from './push-intent-results.mts'
import { claimNotificationPushIntent } from './push-intents.mts'

describe('notification push generation fence', () => {
  it('rejects an in-flight outcome after the endpoint moves to a fresh generation', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const endpoint = `https://push.example.test/generation-fence-${crypto.randomUUID()}`
    const stale = await createSubscription(recipient.id, endpoint, 'stale')
    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notification!.id },
      120,
    )
    const current = await createSubscription(recipient.id, endpoint, 'replacement')

    await expect(
      persistClaimedNotificationPushOutcome(intent!, { kind: 'delivered', subscription: stale }),
    ).resolves.toBe('subscription_stale')
    await expect(
      getTestNotificationPushReceipt(recipient.id, notification!.id, stale.id),
    ).resolves.toBeUndefined()
    await expect(getTestWebPushSubscription(recipient.id, current.id)).resolves.toMatchObject({
      deleted_at: null,
      last_failure_at: null,
      last_success_at: null,
    })
  })

  it('linearizes persistence behind a concurrent endpoint transfer', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const endpoint = `https://push.example.test/concurrent-fence-${crypto.randomUUID()}`
    const stale = await createSubscription(recipient.id, endpoint, 'stale')
    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notification!.id },
      120,
    )
    await using transfer = await holdTestWebPushEndpointOwnershipReplacement(endpoint)
    const persistence = persistClaimedNotificationPushOutcome(intent!, {
      kind: 'delivered',
      subscription: stale,
    })
    await vi.waitFor(async () => {
      await expect(transfer.hasBlockedOperation()).resolves.toBe(true)
    })
    const currentId = await transfer.replace({
      userId: recipient.id,
      endpoint,
      staleSubscriptionId: stale.id,
    })

    await expect(persistence).resolves.toBe('subscription_stale')
    await expect(
      getTestNotificationPushReceipt(recipient.id, notification!.id, stale.id),
    ).resolves.toBeUndefined()
    await expect(getTestWebPushSubscription(recipient.id, currentId)).resolves.toMatchObject({
      deleted_at: null,
      last_success_at: null,
    })
  })
})

function createSubscription(userId: string, endpoint: string, secret: string) {
  return upsertWebPushSubscription({
    userId,
    endpoint,
    p256dh: `${secret}-p256dh-secret`,
    auth: `${secret}-auth-secret`,
    expirationTimeMs: null,
    userAgent: 'vitest',
  })
}
