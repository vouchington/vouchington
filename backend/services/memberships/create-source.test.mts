import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createRetiredTestSku,
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipRaw,
  runConcurrentTestMembershipProductValidation,
  runConcurrentTestRetainedMembershipProductReconciliation,
} from '@voucha/test-helpers'
import { runMembershipGrantsAfterActivationDecisionForTest } from '@voucha/test-helpers/membership-grant-race'
import { createMembership, grantMembership, InvalidMembershipGrantSkuError } from './create.mts'
import { getMembershipProductIdForCreation } from './create-source.mts'

describe('create source concurrency', () => {
  it('commits grants for distinct users concurrently', async () => {
    const admin = await createTestUser({ administrator: true })
    const sku = await createTestSku({ plan: 'plus' })
    const users = await Promise.all(Array.from({ length: 16 }, () => createTestUser()))
    const grants = await Promise.all(
      users.map(user => grantMembership(admin.id, user.id, 'plus', sku.id, 30)),
    )
    expect(grants).toHaveLength(users.length)
    expect(new Set(grants.map(grant => grant.id)).size).toBe(users.length)
    const queues = await Promise.all(users.map(user => getTestGrantQueue(user.id)))
    for (let index = 0; index < grants.length; index++)
      expect(queues[index]).toMatchObject({
        grant_ids: [grants[index]?.grantId],
        open_activation_count: 1,
      })
  })

  it('returns a grant conflict for the losing simultaneous first activation', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const outcomes = await runMembershipGrantsAfterActivationDecisionForTest(query =>
      createMembership(
        { userId: user.id, plan: 'plus', skuId: sku.id, durationDays: 30 },
        { query },
      ),
    )
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find(outcome => outcome.status === 'rejected')
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { statusCode: 409, code: 'MEMBERSHIP_GRANT_CONFLICT' },
    })
    const winner = outcomes.find(outcome => outcome.status === 'fulfilled')
    if (!winner || winner.status !== 'fulfilled') throw new Error('Expected a winning grant')
    await expect(getTestGrantQueue(user.id)).resolves.toMatchObject({
      grant_ids: [winner.value.grantId],
      active_grant_ids: [winner.value.grantId],
      open_activation_count: 1,
    })
    await expect(getTestMembershipRaw(winner.value.id)).resolves.toMatchObject({
      id: winner.value.id,
      projection_ended_at: null,
    })
  })

  it('allows concurrent active-SKU validation for separate creations', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    await expect(
      runConcurrentTestMembershipProductValidation(query =>
        getMembershipProductIdForCreation({ userId: user.id, plan: 'plus', skuId: sku.id }, query),
      ),
    ).resolves.toBe(sku.id)
  })

  it('keeps one open activation when two first grants race', async () => {
    const user = await createTestUser()
    const plusSku = await createTestSku({ plan: 'plus' })
    const proSku = await createTestSku({ plan: 'pro' })

    const outcomes = await Promise.allSettled([
      createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: plusSku.id,
        durationDays: 30,
      }),
      createMembership({
        userId: user.id,
        plan: 'pro',
        skuId: proSku.id,
        durationDays: 30,
      }),
    ])

    expect(outcomes.some(outcome => outcome.status === 'fulfilled')).toBe(true)
    const queue = await getTestGrantQueue(user.id)
    expect(queue?.open_activation_count).toBe(1)
  })

  it('rejects a retired product for a new Stripe source', async () => {
    const applicationId = `test-create-source-retired-new-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createRetiredTestSku({
      plan: 'pro',
      provider_application_id: applicationId,
    })

    await expect(
      createMembership({
        userId: user.id,
        plan: 'pro',
        skuId: sku.id,
        stripeSubscriptionId: `sub_retired_new_${user.id}`,
        providerApplicationId: applicationId,
      }),
    ).rejects.toBeInstanceOf(InvalidMembershipGrantSkuError)
  })

  it('allows concurrent validation of a retained retired Stripe product', async () => {
    const applicationId = `test-create-source-retired-retained-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createRetiredTestSku({
      plan: 'pro',
      provider_application_id: applicationId,
    })
    const subscriptionId = `sub_retired_retained_${user.id}`
    const retained = await createTestMembership({
      user_id: user.id,
      sku_id: sku.id,
      status: 'paused',
      stripe_subscription_id: subscriptionId,
      provider_environment: 'production',
      provider_application_id: applicationId,
    })
    await createTestMembership({ user_id: user.id, stripe_subscription_id: null })

    await expect(
      runConcurrentTestRetainedMembershipProductReconciliation({
        membershipSourceId: retained.membership_source_id,
        userId: user.id,
        validate: query =>
          getMembershipProductIdForCreation(
            {
              userId: user.id,
              plan: 'pro',
              skuId: sku.id,
              stripeSubscriptionId: subscriptionId,
              providerApplicationId: applicationId,
            },
            query,
          ),
      }),
    ).resolves.toEqual([sku.id, sku.id])
  })
})
