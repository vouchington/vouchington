import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getTestNotificationPushReceipt,
  getTestWebPushEndpointOwner,
  getTestWebPushSubscription,
} from '@voucha/test-helpers'
import { runTestWebPushWriterRace } from '@voucha/test-helpers/web-push-writer-race'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import {
  deleteExactWebPushSubscription,
  deleteWebPushSubscription,
  upsertWebPushSubscription,
} from '@services/notifications/push-subscriptions'
import {
  listPendingActivePushSubscriptions,
  persistClaimedNotificationPushOutcome,
} from './push-intent-results.mts'
import { claimNotificationPushIntent } from './push-intents.mts'

describe('Web Push writer races', () => {
  it.each([
    ['transfer', 'expiration'],
    ['transfer', 'invalid response'],
    ['manual deletion', 'expiration'],
    ['manual deletion', 'invalid response'],
    ['logout deletion', 'expiration'],
    ['logout deletion', 'invalid response'],
  ] as const)('%s can win against %s without a deadlock', async (initiator, competitor) => {
    const [recipient, follower] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const registration = {
      endpoint: `https://push.example.test/writer-race-${crypto.randomUUID()}`,
      p256dh: 'a'.repeat(32),
      auth: 'b'.repeat(16),
    }
    const original = await upsertWebPushSubscription({
      ...registration,
      userId: recipient.id,
      expirationTimeMs: competitor === 'expiration' ? 1 : null,
    })
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notification!.id },
      120,
    )
    if (!intent) throw new Error('Web Push writer race could not claim its notification intent')

    const [initiated, competed] = await runTestWebPushWriterRace(
      original,
      async () => {
        switch (initiator) {
          case 'transfer':
            return upsertWebPushSubscription({ ...registration, userId: follower.id })
          case 'manual deletion':
            return deleteWebPushSubscription(recipient.id, original.id)
          case 'logout deletion':
            return deleteExactWebPushSubscription(recipient.id, {
              endpoint: registration.endpoint,
              subscriptionId: original.id,
            })
        }
      },
      async () =>
        competitor === 'expiration'
          ? listPendingActivePushSubscriptions(intent)
          : persistClaimedNotificationPushOutcome(intent, {
              kind: 'subscription_invalid',
              subscription: original,
            }),
    )

    if (initiated.status === 'rejected') throw initiated.reason
    if (competed.status === 'rejected') throw competed.reason
    expect(competed.value).toEqual(competitor === 'expiration' ? [] : 'subscription_stale')

    const [retired, owner, receipt] = await Promise.all([
      getTestWebPushSubscription(recipient.id, original.id),
      getTestWebPushEndpointOwner(registration.endpoint),
      getTestNotificationPushReceipt(recipient.id, notification!.id, original.id),
    ])
    expect(retired).toMatchObject({ deleted_at: expect.any(Date), last_failure_at: null })
    expect(receipt).toBeUndefined()
    const expectedInitiatorResult = {
      transfer: expect.objectContaining({ user_id: follower.id, id: expect.any(String) }),
      'manual deletion': true,
      'logout deletion': undefined,
    }
    expect(initiated.value).toEqual(expectedInitiatorResult[initiator])
    const current = typeof initiated.value === 'object' ? initiated.value : undefined
    expect(owner).toEqual(current && { user_id: follower.id, subscription_id: current.id })
    expect(owner?.subscription_id).not.toBe(original.id)
    const replacement = current && (await getTestWebPushSubscription(follower.id, current.id))
    expect(replacement).toEqual(
      current && { deleted_at: null, last_failure_at: null, last_success_at: null },
    )
  })
})
