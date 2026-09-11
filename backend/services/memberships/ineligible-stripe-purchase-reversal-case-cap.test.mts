import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { failIneligiblePurchaseReversal } from './ineligible-stripe-purchase-reversal-execution.mts'
import {
  claimIneligiblePurchaseReversals,
  claimPersistedIneligiblePurchaseReversalCase,
} from './ineligible-stripe-purchase-reversal/claim-ledger.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from './reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import type { IneligibleStripePurchaseOperations } from './reverse-ineligible-stripe-purchase.mts'

describe('ineligible Stripe purchase reversal case cap', () => {
  it('reserves an earlier allocation before a reordered late payment consumes the residual cap', async () => {
    const { options, originatingInvoiceId } = await createCaseFixture()
    const firstTarget = {
      amountMinorUnits: 400,
      chargeId: `ch_z_first_${randomUUID()}`,
      currency: 'usd',
      invoiceId: originatingInvoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 400,
    }
    const initial = (await claimIneligiblePurchaseReversals(options, [firstTarget], {
      currency: 'usd',
      qualifyingAmountMinorUnits: 1_000,
    }))!
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('provider call interrupted')),
      ),
    )
    const lateTarget = {
      amountMinorUnits: 800,
      chargeId: `ch_a_late_${randomUUID()}`,
      currency: 'usd',
      invoiceId: originatingInvoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 800,
    }

    const reconciled = await claimPersistedIneligiblePurchaseReversalCase(options, [
      lateTarget,
      {
        ...firstTarget,
        amountMinorUnits: 200,
        externallySatisfiedMinorUnits: 200,
        providerObservedAmountMinorUnits: 200,
      },
    ])

    expect(reconciled?.reversals).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({
          amountMinorUnits: 600,
          chargeId: lateTarget.chargeId,
          qualifyingAmountMinorUnits: 600,
        }),
      }),
      expect.objectContaining({
        target: expect.objectContaining({
          amountMinorUnits: 200,
          chargeId: firstTarget.chargeId,
          qualifyingAmountMinorUnits: 400,
        }),
      }),
    ])
  })

  it('rejects reconciliation when the recorded invoice is absent from Stripe', async () => {
    const { options, originatingInvoiceId } = await createCaseFixture()
    const target = {
      amountMinorUnits: 100,
      chargeId: `ch_case_conflict_${randomUUID()}`,
      currency: 'usd',
      invoiceId: originatingInvoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }
    await claimIneligiblePurchaseReversals(options, [target], {
      currency: target.currency,
      qualifyingAmountMinorUnits: target.qualifyingAmountMinorUnits,
    })

    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId,
        providerEnvironment: options.providerEnvironment,
        operations: {
          cancelSubscriptionImmediately:
            vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>(),
          createRefund: vi.fn<IneligibleStripePurchaseOperations['createRefund']>(),
          getDisputeSettlementForPayment:
            vi.fn<
              NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>
            >(),
          listRefundsForPaymentPage:
            vi.fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>(),
          listSubscriptionInvoices: vi
            .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
            .mockResolvedValue([]),
        },
      }),
    ).rejects.toThrow(`Stripe reversal invoice ${originatingInvoiceId} was not found exactly once`)
  })
})

async function createCaseFixture() {
  const user = await createTestUser()
  const currentSku = await createTestSku({ plan: 'plus' })
  await createMembership({
    providerEnvironment: 'production',
    plan: 'plus',
    skuId: currentSku.id,
    stripeSubscriptionId: `sub_case_cap_current_${randomUUID()}`,
    userId: user.id,
  })
  const incomingSku = await createTestSku({ plan: 'pro' })
  const originatingInvoiceId = `in_case_cap_${randomUUID()}`
  return {
    options: {
      customerId: `cus_case_cap_${randomUUID()}`,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro' as const,
      incomingStatus: 'active' as const,
      originatingInvoiceId,
      providerEnvironment: 'production' as const,
      sku: incomingSku,
      stripePriceId: incomingSku.stripe_price_id,
      subscriptionId: `sub_case_cap_${randomUUID()}`,
      userId: user.id,
    },
    originatingInvoiceId,
  }
}
