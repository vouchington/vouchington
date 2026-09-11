import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import {
  failIneligiblePurchaseReversal,
  markIneligiblePurchaseReversalCompleted,
} from './ineligible-stripe-purchase-reversal-execution.mts'
import { claimIneligiblePurchaseReversals } from './ineligible-stripe-purchase-reversal/claim-ledger.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from './reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import type { IneligibleStripePurchaseOperations } from './reverse-ineligible-stripe-purchase.mts'

describe('reconcileRecordedIneligibleStripePurchaseReversal cancellation recovery', () => {
  it('does not contact Stripe when no immutable reversal case exists', async () => {
    const listSubscriptionInvoices =
      vi.fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()

    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId: `in_absent_case_${randomUUID()}`,
        providerEnvironment: 'production',
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
          listSubscriptionInvoices,
        },
      }),
    ).resolves.toBe(false)

    expect(listSubscriptionInvoices).not.toHaveBeenCalled()
  })

  it('does not recancel a subscription after cancellation completed before refund recovery', async () => {
    const member = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_reconcile_completed_cancel_${member.id}`,
      providerEnvironment: 'production',
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_reconcile_completed_cancel_${member.id}`
    const invoiceId = `in_reconcile_completed_cancel_${member.id}`
    const target = {
      amountMinorUnits: 100,
      chargeId: `ch_reconcile_completed_cancel_${member.id}`,
      currency: 'usd',
      invoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }
    const initial = (await claimIneligiblePurchaseReversals(
      {
        customerId: `cus_reconcile_completed_cancel_${member.id}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'pro',
        incomingStatus: 'active',
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        sku: incomingSku,
        stripePriceId: incomingSku.stripe_price_id,
        subscriptionId,
        userId: member.id,
      },
      [target],
      { currency: target.currency, qualifyingAmountMinorUnits: target.qualifyingAmountMinorUnits },
    ))!
    await markIneligiblePurchaseReversalCompleted(initial.cancellation!)
    await failIneligiblePurchaseReversal(
      initial.reversals[0]!,
      new Error('refund failed after cancellation completed'),
    )
    const cancelSubscriptionImmediately =
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>()
    const createRefund = vi
      .fn<IneligibleStripePurchaseOperations['createRefund']>()
      .mockResolvedValue({
        amount: target.amountMinorUnits,
        currency: target.currency,
        id: `re_reconcile_completed_cancel_${member.id}`,
        status: 'succeeded',
      } as never)

    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        operations: {
          cancelSubscriptionImmediately,
          createRefund,
          getDisputeSettlementForPayment: vi
            .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
            .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
          listRefundsForPaymentPage: vi
            .fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
            .mockResolvedValue({ hasMore: false, nextCursor: undefined, refunds: [] }),
          listSubscriptionInvoices: vi
            .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
            .mockResolvedValue([
              {
                created: 1_893_369_600,
                currency: target.currency,
                id: invoiceId,
                payments: {
                  data: [
                    {
                      amount_paid: target.amountMinorUnits,
                      payment: { type: 'charge', charge: target.chargeId },
                    },
                  ],
                },
                status: 'paid',
              },
            ] as never),
        },
      }),
    ).resolves.toBe(true)

    expect(cancelSubscriptionImmediately).not.toHaveBeenCalled()
    expect(createRefund).toHaveBeenCalledWith({
      amountMinorUnits: target.amountMinorUnits,
      chargeId: target.chargeId,
      idempotencyKey: expect.any(String),
      paymentIntentId: undefined,
    })
    await expect(
      getTestIneligiblePurchaseReversal(subscriptionId, 'production'),
    ).resolves.toMatchObject({
      amount_minor_units: String(target.amountMinorUnits),
      completed_at: expect.any(Date),
      provider_refund_id: `re_reconcile_completed_cancel_${member.id}`,
    })
  })
})
