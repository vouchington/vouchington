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
  recordIneligiblePurchaseReversalProviderRefund,
} from './ineligible-stripe-purchase-reversal-execution.mts'
import { claimIneligiblePurchaseReversals } from './ineligible-stripe-purchase-reversal/claim-ledger.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from './reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import type { IneligibleStripePurchaseOperations } from './reverse-ineligible-stripe-purchase.mts'

describe('recorded ineligible Stripe purchase failed-refund reconciliation', () => {
  it('reconciles to zero when a known failed refund was superseded by an external refund', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_failed_refund_${randomUUID()}`,
      providerEnvironment: 'production',
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const options = {
      customerId: `cus_failed_refund_${randomUUID()}`,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro' as const,
      incomingStatus: 'active' as const,
      originatingInvoiceId: `in_failed_refund_${randomUUID()}`,
      providerEnvironment: 'production' as const,
      sku: incomingSku,
      stripePriceId: incomingSku.stripe_price_id,
      subscriptionId: `sub_failed_refund_${randomUUID()}`,
      userId: user.id,
    }
    const target = {
      amountMinorUnits: 1_000,
      chargeId: `ch_failed_refund_${randomUUID()}`,
      currency: 'usd',
      invoiceId: options.originatingInvoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 1_000,
    }
    const initial = (await claimIneligiblePurchaseReversals(options, [target], {
      currency: target.currency,
      qualifyingAmountMinorUnits: target.qualifyingAmountMinorUnits,
    }))!
    const knownFailedRefundId = `re_failed_${randomUUID()}`
    await recordIneligiblePurchaseReversalProviderRefund(initial.reversals[0]!, knownFailedRefundId)
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('known refund failed')),
      ),
    )

    const createRefund = vi.fn<IneligibleStripePurchaseOperations['createRefund']>()
    const externalRefundId = `re_external_${randomUUID()}`
    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId: options.originatingInvoiceId,
        providerEnvironment: options.providerEnvironment,
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
                  id: externalRefundId,
                  status: 'succeeded',
                },
              ],
            } as never),
          listSubscriptionInvoices: vi
            .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
            .mockResolvedValue([
              {
                created: 1_893_369_600,
                currency: target.currency,
                id: options.originatingInvoiceId,
                payments: {
                  data: [
                    {
                      amount_paid: target.amountMinorUnits,
                      payment: { charge: target.chargeId, type: 'charge' },
                    },
                  ],
                },
                status: 'paid',
              },
            ] as never),
          retrieveRefund: vi
            .fn<NonNullable<IneligibleStripePurchaseOperations['retrieveRefund']>>()
            .mockResolvedValue({ id: knownFailedRefundId, status: 'failed' } as never),
        },
      }),
    ).resolves.toBe(true)

    expect(createRefund).not.toHaveBeenCalled()
    await expect(
      getTestIneligiblePurchaseReversal(options.subscriptionId, options.providerEnvironment),
    ).resolves.toMatchObject({
      completed_at: expect.any(Date),
      receipt_amount_minor_units: '0',
    })
  })
})
