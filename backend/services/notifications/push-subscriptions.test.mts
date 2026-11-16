import { runTestWebPushClaimRace } from '@voucha/test-helpers/web-push-claim-race'
import { runTestWebPushRenewalDeleteRace } from '@voucha/test-helpers/web-push-renewal-delete-race'
import {
  createTestUserDirect,
  deleteTestWebPushEndpointOwner,
  getTestWebPushEndpointOwner,
  getTestWebPushEndpointOwnershipCounts,
  observeTestPostgresQueryPools,
  softDeleteTestWebPushSubscription,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
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
  it.each(['delete', 'exact'] as const)(
    'finishes renewal overlapping %s deletion without an ownership cycle',
    async kind => {
      const user = await createTestUserDirect()
      const endpoint = `https://push.example.test/${crypto.randomUUID()}`
      const original = await upsertWebPushSubscription(input(user.id, endpoint))
      const renewed = await runTestWebPushRenewalDeleteRace({
        userId: user.id,
        deleteMarker:
          kind === 'delete'
            ? '/* deleteWebPushSubscription */'
            : '/* deleteExactWebPushSubscription */',
        renew: () => upsertWebPushSubscription(input(user.id, endpoint)),
        remove: () =>
          kind === 'delete'
            ? deleteWebPushSubscription(user.id, original.id)
            : deleteExactWebPushSubscription(user.id, {
                endpoint,
                subscriptionId: original.id,
              }),
      })
      await expect(getTestWebPushEndpointOwner(endpoint)).resolves.toEqual({
        user_id: user.id,
        subscription_id: renewed.id,
      })
      await expect(getTestWebPushEndpointOwnershipCounts(endpoint)).resolves.toEqual({
        ownerCount: 1,
        activeSubscriptionCount: 1,
      })
      await expect(deleteWebPushSubscription(user.id, original.id)).resolves.toBe(false)
    },
  )
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

  it('keeps one owner across concurrent claims for one endpoint', async () => {
    const [firstUser, secondUser] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    const outcomes = await runTestWebPushClaimRace(endpoint, [
      () => upsertWebPushSubscription(input(firstUser!.id, endpoint)),
      () => upsertWebPushSubscription(input(secondUser!.id, endpoint)),
    ])
    expect(outcomes.some(outcome => outcome.status === 'fulfilled')).toBe(true)
    for (const outcome of outcomes.filter(result => result.status === 'rejected'))
      expect(outcome.reason).toMatchObject({ status: 409 })
    const owner = await getTestWebPushEndpointOwner(endpoint)
    expect(
      outcomes.some(
        result =>
          result.status === 'fulfilled' &&
          result.value.id === owner?.subscription_id &&
          result.value.user_id === owner.user_id,
      ),
    ).toBe(true)
    await expect(getTestWebPushEndpointOwnershipCounts(endpoint)).resolves.toEqual({
      ownerCount: 1,
      activeSubscriptionCount: 1,
    })
  })

  it('keeps one activation across competing same-user renewals', async () => {
    const user = await createTestUserDirect()
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`
    const original = await upsertWebPushSubscription(input(user.id, endpoint))
    const outcomes = await runTestWebPushClaimRace(endpoint, [
      () => upsertWebPushSubscription(input(user.id, endpoint)),
      () => upsertWebPushSubscription(input(user.id, endpoint)),
    ])
    expect(outcomes.some(outcome => outcome.status === 'fulfilled')).toBe(true)
    for (const outcome of outcomes.filter(result => result.status === 'rejected'))
      expect(outcome.reason).toMatchObject({ status: 409 })
    const owner = await getTestWebPushEndpointOwner(endpoint)
    expect(owner?.subscription_id).not.toBe(original.id)
    expect(
      outcomes.some(
        outcome => outcome.status === 'fulfilled' && outcome.value.id === owner?.subscription_id,
      ),
    ).toBe(true)
    await expect(getTestWebPushEndpointOwnershipCounts(endpoint)).resolves.toEqual({
      ownerCount: 1,
      activeSubscriptionCount: 1,
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
