import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createRetiredTestSku,
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  runConcurrentTestMembershipProductValidation,
  runConcurrentTestRetainedMembershipProductReconciliation,
} from '@voucha/test-helpers'
import { createMembership, InvalidMembershipGrantSkuError } from './create.mts'
import { getMembershipProductIdForCreation } from './create-source.mts'

describe('create source concurrency', () => {
  it('fills a previously unknown Stripe originating invoice exactly once', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_origin_fill_${user.id}`
    const originatingInvoiceId = `in_origin_fill_${user.id}`

    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
    })

    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeOriginatingInvoiceId: originatingInvoiceId,
    })

    await expect(
      createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        stripeSubscriptionId: subscriptionId,
        stripeOriginatingInvoiceId: `in_origin_conflict_${user.id}`,
      }),
    ).rejects.toThrow('originating invoice does not match the incoming event')
  })

  it('persists the first Stripe originating invoice and rejects a conflicting replay', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_origin_${user.id}`
    const originatingInvoiceId = `in_origin_${user.id}`

    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeOriginatingInvoiceId: originatingInvoiceId,
    })

    await expect(
      createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        stripeSubscriptionId: subscriptionId,
        stripeOriginatingInvoiceId: `in_conflict_${user.id}`,
      }),
    ).rejects.toThrow('originating invoice does not match the incoming event')
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

  it('serializes concurrent first grants for one user before inspecting open activations', async () => {
    const user = await createTestUser()
    const plusSku = await createTestSku({ plan: 'plus' })
    const proSku = await createTestSku({ plan: 'pro' })

    await expect(
      Promise.all([
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
      ]),
    ).resolves.toHaveLength(2)

    const queue = await getTestGrantQueue(user.id)
    expect(queue?.grant_ids).toHaveLength(2)
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
