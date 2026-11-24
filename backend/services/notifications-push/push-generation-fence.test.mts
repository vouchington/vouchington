import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getTestNotificationPushReceipt,
  getTestWebPushSubscription,
  holdTestWebPushEndpointOwnershipReplacement,
} from '@voucha/test-helpers'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { createTestPostgresMultiWait } from '@voucha/test-helpers/postgres-multi-client-lock-observer'
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

  it('records a retryable failure while endpoint ownership is unchanged and busy', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const endpoint = `https://push.example.test/retry-owner-${crypto.randomUUID()}`
    const subscription = await createSubscription(recipient.id, endpoint, 'retry')
    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notification!.id },
      120,
    )
    await using holder = await holdTestWebPushEndpointOwnershipReplacement(endpoint)
    await using waits = await createTestPostgresMultiWait()
    const observed = await waits.start(
      {
        holderProcessId: holder.holderProcessId,
        pool: 'write',
        lock: { kind: 'transaction' },
        queryMarker: 'persistClaimedNotificationPushOutcome',
        releaseHolder: holder.release,
      },
      () =>
        persistClaimedNotificationPushOutcome(intent!, { kind: 'retryable_failure', subscription }),
    )
    expect(
      await Promise.race([
        observed.operation,
        observed.waitForLock().then(() => 'blocked by owner'),
      ]),
    ).toBe('persisted')
    await expect(getTestWebPushSubscription(recipient.id, subscription.id)).resolves.toMatchObject({
      deleted_at: null,
      last_failure_at: expect.any(Date),
      last_success_at: null,
    })
    await expect(
      getTestNotificationPushReceipt(recipient.id, notification!.id, subscription.id),
    ).resolves.toBeUndefined()
  })

  it('rejects a retryable failure when concurrent subscription retirement commits first', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const endpoint = `https://push.example.test/retry-retirement-${crypto.randomUUID()}`
    const stale = await createSubscription(recipient.id, endpoint, 'stale')
    const intent = await claimNotificationPushIntent(
      { user_id: recipient.id, notification_id: notification!.id },
      120,
    )
    const retired = Promise.withResolvers<number>()
    const resumeTransfer = Promise.withResolvers<void>()
    const restore = afterPostgresTransactionQueryForTest(
      '/* releaseWebPushEndpointOwner */',
      values => values.includes(stale.id),
      async query => {
        retired.resolve(await getTestPostgresBackendProcessId(query))
        await resumeTransfer.promise
      },
    )
    const replacement = Promise.allSettled([
      createSubscription(recipient.id, endpoint, 'replacement'),
    ])
    try {
      const holderProcessId = await Promise.race([
        retired.promise,
        replacement.then(([result]) => {
          if (result.status === 'rejected') throw result.reason
          throw new Error('Replacement completed before pausing after subscription retirement')
        }),
      ])
      await withTestOwnedPostgresWait(
        {
          holderProcessId,
          pool: 'write',
          lock: { kind: 'transaction' },
          queryMarker: 'persistClaimedNotificationPushOutcome',
          releaseHolder: async () => {
            resumeTransfer.resolve()
          },
        },
        async waitForRetirement => {
          const persistence = persistClaimedNotificationPushOutcome(intent!, {
            kind: 'retryable_failure',
            subscription: stale,
          })
          await waitForRetirement(persistence)
          resumeTransfer.resolve()
          await expect(persistence).resolves.toBe('subscription_stale')
        },
      )
      const [result] = await replacement
      if (result.status === 'rejected') throw result.reason
      const current = result.value
      await expect(getTestWebPushSubscription(recipient.id, stale.id)).resolves.toMatchObject({
        deleted_at: expect.any(Date),
        last_failure_at: null,
      })
      await expect(getTestWebPushSubscription(recipient.id, current.id)).resolves.toMatchObject({
        deleted_at: null,
        last_failure_at: null,
      })
      await expect(
        getTestNotificationPushReceipt(recipient.id, notification!.id, stale.id),
      ).resolves.toBeUndefined()
    } finally {
      resumeTransfer.resolve()
      restore()
      await replacement
    }
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
