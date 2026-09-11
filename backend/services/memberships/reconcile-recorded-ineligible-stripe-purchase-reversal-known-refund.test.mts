import { describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import {
  failIneligiblePurchaseReversal,
  recordIneligiblePurchaseReversalProviderRefund,
} from './ineligible-stripe-purchase-reversal-execution.mts'
import { claimIneligiblePurchaseReversals } from './ineligible-stripe-purchase-reversal/claim-ledger.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from './reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import type { IneligibleStripePurchaseOperations } from './reverse-ineligible-stripe-purchase.mts'

describe('recorded ineligible Stripe purchase known-refund reconciliation', () => {
  it('records its known succeeded refund instead of a zero-amount external receipt', async () => {
    const member = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_reconcile_known_${member.id}`,
      providerEnvironment: 'production',
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_reconcile_known_${member.id}`
    const refundId = `re_reconcile_known_${member.id}`
    const invoiceId = `in_reconcile_known_${member.id}`
    const target = {
      amountMinorUnits: 100,
      chargeId: `ch_reconcile_known_${member.id}`,
      currency: 'usd',
      invoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }
    const initial = (await claimIneligiblePurchaseReversals(
      {
        customerId: `cus_reconcile_known_${member.id}`,
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
    const reversal = initial.reversals[0]!
    await recordIneligiblePurchaseReversalProviderRefund(reversal, refundId)
    await Promise.all(
      [initial.cancellation!, reversal].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('provider response was lost')),
      ),
    )
    const createRefund = vi.fn<IneligibleStripePurchaseOperations['createRefund']>()
    const retrieveRefund = vi
      .fn<NonNullable<IneligibleStripePurchaseOperations['retrieveRefund']>>()
      .mockResolvedValue({
        amount: target.amountMinorUnits,
        currency: target.currency,
        id: refundId,
        status: 'succeeded',
      } as never)

    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        operations: {
          cancelSubscriptionImmediately:
            vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>(),
          createRefund,
          getDisputeSettlementForPayment: vi
            .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
            .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
          listRefundsForPaymentPage: vi
            .fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
            .mockResolvedValue({
              hasMore: false,
              nextCursor: undefined,
              refunds: [
                {
                  amount: target.amountMinorUnits,
                  currency: target.currency,
                  id: refundId,
                  status: 'succeeded',
                },
              ],
            } as never),
          listSubscriptionInvoices: vi
            .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
            .mockResolvedValue([
              {
                id: invoiceId,
                status: 'paid',
                amount_paid: target.amountMinorUnits,
                currency: target.currency,
                created: 1_893_369_600,
                description: null,
                payments: {
                  data: [
                    {
                      amount_paid: target.amountMinorUnits,
                      payment: { type: 'charge', charge: target.chargeId },
                    },
                  ],
                },
              },
            ] as never),
          retrieveRefund,
        },
      }),
    ).resolves.toBe(true)

    expect(createRefund).not.toHaveBeenCalled()
    expect(retrieveRefund).toHaveBeenCalledWith(refundId)
    await expect(
      getTestIneligiblePurchaseReversal(subscriptionId, 'production'),
    ).resolves.toMatchObject({
      amount_minor_units: '100',
      completed_at: expect.any(Date),
      provider_refund_id: refundId,
      receipt_amount_minor_units: '100',
      receipt_remaining_refundable_minor_units: '100',
    })
  })
})
