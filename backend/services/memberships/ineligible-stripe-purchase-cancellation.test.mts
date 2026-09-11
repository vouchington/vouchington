import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { markIneligiblePurchaseReversalCompleted } from './ineligible-stripe-purchase-reversal-execution.mts'
import { claimIneligiblePurchaseReversals } from './ineligible-stripe-purchase-reversal/claim-ledger.mts'

describe('claimIneligiblePurchaseCancellationOperation', () => {
  it('returns the completed cancellation instead of taking a new execution claim', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_cancellation_${randomUUID()}`,
      providerEnvironment: 'production',
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_cancellation_${randomUUID()}`
    const options = {
      customerId: `cus_cancellation_${randomUUID()}`,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro' as const,
      incomingStatus: 'active' as const,
      originatingInvoiceId: `in_cancellation_${randomUUID()}`,
      providerEnvironment: 'production' as const,
      sku: incomingSku,
      stripePriceId: incomingSku.stripe_price_id,
      subscriptionId,
      userId: user.id,
    }
    const snapshot = { currency: 'usd', qualifyingAmountMinorUnits: 0 }
    const initial = (await claimIneligiblePurchaseReversals(options, [], snapshot))!
    await markIneligiblePurchaseReversalCompleted(initial.cancellation!)

    await expect(claimIneligiblePurchaseReversals(options, [], snapshot)).resolves.toEqual({
      cancellation: {
        completed: true,
        executionClaimToken: null,
        id: initial.cancellation!.id,
        idempotencyKey: initial.cancellation!.idempotencyKey,
      },
      reversals: [],
    })
  })
})
