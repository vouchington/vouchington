import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createMembershipBindingForRebindForTest,
  createTestMembership,
  createTestSku,
  createTestUser,
  releaseMembershipSourceForRebindForTest,
} from '@voucha/test-helpers'
import { prepareIneligiblePurchaseReversal } from './ineligible-stripe-purchase-reversal/prepare.mts'

describe('ineligible Stripe purchase reversal origin', () => {
  it('selects the later UUIDv7 binding at an equal bound timestamp and preserves its first origin', async () => {
    const user = await createTestUser()
    const targetSku = await createTestSku({ plan: 'pro' })
    const targetSubscriptionId = `sub_equal_bound_target_${randomUUID()}`
    const targetCustomerId = `cus_equal_bound_target_${randomUUID()}`
    const boundAt = new Date('2025-01-01T00:00:00.000Z')
    const retiredTarget = await createTestMembership({
      binding_bound_at: boundAt,
      user_id: user.id,
      sku_id: targetSku.id,
      stripe_customer_id: targetCustomerId,
      stripe_subscription_id: targetSubscriptionId,
      provider_environment: 'production',
    })
    await releaseMembershipSourceForRebindForTest(retiredTarget.membership_source_id)
    await createMembershipBindingForRebindForTest(
      retiredTarget.membership_source_id,
      user.id,
      boundAt,
    )
    const currentSku = await createTestSku({ plan: 'plus' })
    await createTestMembership({
      user_id: user.id,
      sku_id: currentSku.id,
      stripe_subscription_id: `sub_equal_bound_current_${randomUUID()}`,
      provider_environment: 'production',
    })
    const initialOriginatingInvoiceId = `in_equal_bound_${randomUUID()}`
    const prepared = await prepareIneligiblePurchaseReversal({
      customerId: targetCustomerId,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro',
      incomingStatus: 'active',
      originatingInvoiceId: initialOriginatingInvoiceId,
      providerEnvironment: 'production',
      sku: targetSku,
      stripePriceId: targetSku.stripe_price_id,
      subscriptionId: targetSubscriptionId,
      userId: user.id,
    })
    expect(prepared).toMatchObject({
      bindingBoundAt: boundAt,
      originatingInvoiceId: initialOriginatingInvoiceId,
    })
    await expect(
      prepareIneligiblePurchaseReversal({
        customerId: targetCustomerId,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'pro',
        incomingStatus: 'active',
        originatingInvoiceId: `in_equal_bound_replay_${randomUUID()}`,
        providerEnvironment: 'production',
        sku: targetSku,
        stripePriceId: targetSku.stripe_price_id,
        subscriptionId: targetSubscriptionId,
        userId: user.id,
      }),
    ).rejects.toThrow('originating invoice does not match the incoming event')
  })
})
