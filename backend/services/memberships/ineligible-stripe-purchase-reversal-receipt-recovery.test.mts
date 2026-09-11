import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
  recordTestIneligiblePurchaseReversalReceipt,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { markIneligiblePurchaseReversalCompleted } from './ineligible-stripe-purchase-reversal-execution.mts'
import { claimIneligiblePurchaseReversals } from './ineligible-stripe-purchase-reversal/claim-ledger.mts'

describe('ineligible Stripe purchase reversal receipt recovery', () => {
  it('finishes a receipt-recorded reversal without acquiring another execution lease', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_receipt_recovery_current_${randomUUID()}`,
      providerEnvironment: 'production',
    })
    const sku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_receipt_recovery_${randomUUID()}`
    const originatingInvoiceId = `in_receipt_recovery_${randomUUID()}`
    const options = {
      customerId: `cus_receipt_recovery_${randomUUID()}`,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro' as const,
      incomingStatus: 'active' as const,
      originatingInvoiceId,
      providerEnvironment: 'production' as const,
      sku,
      stripePriceId: sku.stripe_price_id,
      subscriptionId,
      userId: user.id,
    }
    const target = {
      amountMinorUnits: 1_000,
      chargeId: `ch_receipt_recovery_${randomUUID()}`,
      currency: 'usd',
      invoiceId: originatingInvoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 1_000,
    }
    const initial = (await claimIneligiblePurchaseReversals(options, [target], {
      currency: target.currency,
      qualifyingAmountMinorUnits: target.qualifyingAmountMinorUnits,
    }))!
    const reversal = initial.reversals[0]!
    await markIneligiblePurchaseReversalCompleted(initial.cancellation!)
    await recordTestIneligiblePurchaseReversalReceipt(
      reversal.id,
      `re_receipt_recovery_${randomUUID()}`,
      target.amountMinorUnits,
    )

    await expect(
      claimIneligiblePurchaseReversals(options, [target], {
        currency: target.currency,
        qualifyingAmountMinorUnits: target.qualifyingAmountMinorUnits,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        reversals: [
          expect.objectContaining({
            completed: true,
            executionClaimToken: null,
            hasReceipt: true,
            id: reversal.id,
          }),
        ],
      }),
    )
    await expect(
      getTestIneligiblePurchaseReversal(subscriptionId, 'production'),
    ).resolves.toMatchObject({ completed_at: expect.any(Date) })
  })
})
