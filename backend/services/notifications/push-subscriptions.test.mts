import {
  createTestUserDirect,
  deleteTestWebPushEndpointOwner,
  getTestWebPushEndpointOwner,
  getTestWebPushEndpointOwnershipCounts,
  holdTestWebPushEndpointOwnershipReplacement,
  observeTestPostgresQueryPools,
  softDeleteTestWebPushSubscription,
  testWebPushSubscriptionRowLockAvailable,
} from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'
import {
  deleteExactWebPushSubscription,
  deleteWebPushSubscription,
  listWebPushSubscriptionsPage,
  upsertWebPushSubscription,
} from './push-subscriptions.mts'

function input(userId: string, endpoint: string) {
  return { userId, endpoint, p256dh: 'a'.repeat(32), auth: 'b'.repeat(16) }
}

describe('web push endpoint ownership', () => {
  it('reads ownership-bearing subscription pages from the primary database', async () => {
    const user = await createTestUserDirect()
    const observed = await observeTestPostgresQueryPools('/* listWebPushSubscriptions */', () =>
      listWebPushSubscriptionsPage(user.id),
    )

    expect(observed.pools).toEqual(['write'])
  })

  it('creates a fresh generation and transfers one endpoint to a later user', async () => {
    const [firstUser, secondUser] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    const first = await upsertWebPushSubscription(input(firstUser!.id, endpoint))
    const replacement = await upsertWebPushSubscription(input(firstUser!.id, endpoint))
    const transferred = await upsertWebPushSubscription(input(secondUser!.id, endpoint))
    expect(replacement.id).not.toBe(first.id)
    expect(transferred.id).not.toBe(replacement.id)
    await expect(getTestWebPushEndpointOwner(endpoint)).resolves.toEqual({
      user_id: secondUser!.id,
      subscription_id: transferred.id,
    })
  })

  it('makes a stale exact delete a no-op', async () => {
    const user = await createTestUserDirect()
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    const first = await upsertWebPushSubscription(input(user!.id, endpoint))
    const current = await upsertWebPushSubscription(input(user!.id, endpoint))
    await deleteExactWebPushSubscription(user!.id, { endpoint, subscriptionId: first.id })
    await expect(getTestWebPushEndpointOwner(endpoint)).resolves.toMatchObject({
      subscription_id: current.id,
    })
  })

  it('removes the current generation through each exact ownership predicate', async () => {
    const user = await createTestUserDirect()
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    const subscription = await upsertWebPushSubscription(input(user!.id, endpoint))

    await expect(deleteWebPushSubscription(user!.id, subscription.id)).resolves.toBe(true)
    await expect(getTestWebPushEndpointOwner(endpoint)).resolves.toBeUndefined()
    await expect(deleteWebPushSubscription(user!.id, subscription.id)).resolves.toBe(false)
  })

  it('removes only the authenticated current generation through exact logout deletion', async () => {
    const user = await createTestUserDirect()
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    const subscription = await upsertWebPushSubscription(input(user!.id, endpoint))

    await deleteExactWebPushSubscription(user!.id, { endpoint, subscriptionId: subscription.id })
    await expect(getTestWebPushEndpointOwner(endpoint)).resolves.toBeUndefined()
  })

  it('serializes concurrent claims for one endpoint', async () => {
    const [firstUser, secondUser] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    await Promise.all([
      upsertWebPushSubscription(input(firstUser!.id, endpoint)),
      upsertWebPushSubscription(input(secondUser!.id, endpoint)),
    ])
    await expect(getTestWebPushEndpointOwnershipCounts(endpoint)).resolves.toEqual({
      ownerCount: 1,
      activeSubscriptionCount: 1,
    })
  })

  it('locks the owner before mutating the current subscription', async () => {
    const user = await createTestUserDirect()
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    const current = await upsertWebPushSubscription(input(user!.id, endpoint))
    await using owner = await holdTestWebPushEndpointOwnershipReplacement(endpoint)

    const replacementRequest = upsertWebPushSubscription(input(user!.id, endpoint))
    await vi.waitFor(async () => {
      await expect(owner.hasBlockedOperation()).resolves.toBe(true)
    })
    await expect(testWebPushSubscriptionRowLockAvailable(current.id)).resolves.toBe(true)

    await owner.release()
    const replacement = await replacementRequest
    await expect(getTestWebPushEndpointOwner(endpoint)).resolves.toEqual({
      user_id: user!.id,
      subscription_id: replacement.id,
    })
  })

  it('rejects a deferred owner/subscription mismatch', async () => {
    const user = await createTestUserDirect()
    const subscription = await upsertWebPushSubscription(
      input(user!.id, `https://push.example.test/${crypto.randomUUID()}`),
    )
    await expect(deleteTestWebPushEndpointOwner(user!.id, subscription.id)).rejects.toThrow(
      /exact active subscription/,
    )
  })

  it('rejects soft-deleting a subscription without removing its owner', async () => {
    const user = await createTestUserDirect()
    const subscription = await upsertWebPushSubscription(
      input(user!.id, `https://push.example.test/${crypto.randomUUID()}`),
    )
    await expect(softDeleteTestWebPushSubscription(user!.id, subscription.id)).rejects.toThrow(
      /exact active subscription/,
    )
  })
})
