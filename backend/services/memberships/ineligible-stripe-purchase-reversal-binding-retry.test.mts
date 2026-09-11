import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createMembershipBindingForRebindForTest,
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversalCaseContext,
  releaseMembershipSourceForRebindForTest,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { failIneligiblePurchaseReversal } from './ineligible-stripe-purchase-reversal-execution.mts'
import { claimIneligiblePurchaseReversals } from './ineligible-stripe-purchase-reversal/claim-ledger.mts'

describe('ineligible Stripe purchase reversal binding retry', () => {
  it('reuses the immutable case after its original binding is released and rebound', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      providerEnvironment: 'production',
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_binding_retry_current_${randomUUID()}`,
      userId: user.id,
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const originatingInvoiceId = `in_binding_retry_${randomUUID()}`
    const options = {
      customerId: `cus_binding_retry_${randomUUID()}`,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro' as const,
      incomingStatus: 'active' as const,
      originatingInvoiceId,
      providerEnvironment: 'production' as const,
      sku: incomingSku,
      stripePriceId: incomingSku.stripe_price_id,
      subscriptionId: `sub_binding_retry_${randomUUID()}`,
      userId: user.id,
    }
    const target = {
      amountMinorUnits: 100,
      chargeId: `ch_binding_retry_${randomUUID()}`,
      currency: 'usd',
      invoiceId: originatingInvoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }
    const snapshot = { currency: 'usd', qualifyingAmountMinorUnits: 100 }
    const initial = (await claimIneligiblePurchaseReversals(options, [target], snapshot))!
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('provider call interrupted')),
      ),
    )
    const context = await getTestIneligiblePurchaseReversalCaseContext(
      options.subscriptionId,
      'production',
    )
    if (!context) throw new Error('Expected an immutable reversal case')
    await releaseMembershipSourceForRebindForTest(context.membership_source_id)
    await createMembershipBindingForRebindForTest(context.membership_source_id, user.id, new Date())

    await expect(
      claimIneligiblePurchaseReversals(options, [target], snapshot),
    ).resolves.toMatchObject({
      cancellation: { id: initial.cancellation!.id },
      reversals: [{ id: initial.reversals[0]!.id }],
    })
  })
})
